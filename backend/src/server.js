import cors from "@fastify/cors";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { closeDatabasePool, createDatabasePool } from "./db.js";
import {
  createDeployment,
  listDeployments,
  readDeploymentWithLogs,
} from "./deployments.js";
import { describeWorkerHeartbeat, readWorkerHeartbeat } from "./heartbeat.js";
import { readPlatformServices } from "./platform.js";
import {
  closeQueueClient,
  createQueueClient,
  dequeueDeploymentJob,
  deploymentQueueKey,
  enqueueDeploymentJob,
} from "./queue.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const defaultWorkerId = process.env.WORKER_ID || "dockyard-worker-1";

export function buildServer({
  databasePool = createDatabasePool(),
  queueClient = createQueueClient(),
} = {}) {
  const app = Fastify({
    logger: true,
  });

  // Milestone 9: allow the frontend dashboard to call the backend API.
  app.register(cors, {
    origin: true,
  });

  // Milestone 5: expose the PostgreSQL pool to routes that need durable state.
  app.decorate("db", databasePool);
  // Milestone 6: expose the Redis queue client for temporary coordination.
  app.decorate("queue", queueClient);
  app.addHook("onClose", async () => {
    await closeQueueClient(queueClient);
    await closeDatabasePool(databasePool);
  });

  // Milestone 1: basic backend health endpoint before database checks exist.
  app.get("/health", async () => ({
    status: "ok",
    service: "backend",
    milestone: "1",
  }));

  app.get("/", async () => ({
    name: "Dockyard backend",
    message: "Milestone 8 backend API can create durable fake deployments.",
  }));

  // Milestone 8: create a durable deployment before queueing worker execution.
  app.post("/deployments", async (request, reply) => {
    const name =
      typeof request.body?.name === "string" && request.body.name.trim()
        ? request.body.name.trim()
        : "Sample Dockyard deployment";

    const deployment = await createDeployment(databasePool, { name });
    const job = await enqueueDeploymentJob(queueClient, {
      deploymentId: Number(deployment.id),
      type: "fake_deployment",
    });

    request.log.info(
      { deploymentId: deployment.id, milestone: "8" },
      "deployment persisted and queued"
    );

    return reply.code(202).send({
      deployment,
      queued: true,
      queue: deploymentQueueKey,
      job,
    });
  });

  // Milestone 8: simple read endpoints make durable deployment logs inspectable.
  app.get("/deployments", async () => ({
    deployments: await listDeployments(databasePool),
  }));

  app.get("/deployments/:id", async (request, reply) => {
    const deploymentId = Number(request.params.id);

    if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
      return reply.code(400).send({
        error: "deployment id must be a positive integer",
      });
    }

    const deploymentWithLogs = await readDeploymentWithLogs(
      databasePool,
      deploymentId
    );

    if (!deploymentWithLogs) {
      return reply.code(404).send({
        error: "deployment not found",
      });
    }

    return deploymentWithLogs;
  });

  // Milestone 7: report worker liveness from PostgreSQL heartbeat data.
  app.get("/platform-services/worker", async () => {
    const heartbeat = await readWorkerHeartbeat(databasePool, defaultWorkerId);

    return {
      service: "worker",
      heartbeat: describeWorkerHeartbeat(heartbeat),
    };
  });

  // Milestone 9: dashboard service status based on app-level checks only.
  app.get("/platform-services", async () =>
    readPlatformServices({
      databasePool,
      queueClient,
      workerId: defaultWorkerId,
    })
  );

  // Milestone 6: simple Redis queue operation for direct Redis learning.
  app.post("/queue/deployment-jobs", async (request, reply) => {
    const deploymentId = Number(request.body?.deploymentId);

    if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
      return reply.code(400).send({
        error: "deploymentId must be a positive integer",
      });
    }

    const job = await enqueueDeploymentJob(queueClient, {
      deploymentId,
      type: "fake_deployment",
    });

    return reply.code(202).send({
      queued: true,
      queue: deploymentQueueKey,
      job,
    });
  });

  // Milestone 6: pop one queued job so Redis behavior can be observed.
  app.get("/queue/deployment-jobs/next", async () => {
    const job = await dequeueDeploymentJob(queueClient);

    return {
      queue: deploymentQueueKey,
      job,
    };
  });

  return app;
}

const app = buildServer();

async function start() {
  try {
    await app.listen({ host, port });
    app.log.info({ host, port, milestone: "1" }, "backend started");
  } catch (error) {
    app.log.error(error, "backend failed to start");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await start();
}
