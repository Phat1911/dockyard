import { fileURLToPath } from "node:url";
import { closeDatabasePool, createDatabasePool } from "./db.js";
import { runFakeDeploymentWorkflow } from "./deployments.js";
import { writeWorkerHeartbeat } from "./heartbeat.js";
import {
  closeQueueClient,
  createQueueClient,
  dequeueDeploymentJob,
} from "./queue.js";

const workerId = process.env.WORKER_ID || "dockyard-worker-1";
const heartbeatIntervalMs = Number(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS || 10000
);
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 3000);

function logWorker(message, extra = {}) {
  console.log(
    JSON.stringify({
      service: "worker",
      milestone: "8",
      workerId,
      message,
      time: new Date().toISOString(),
      ...extra,
    })
  );
}

export async function runWorkerOnce({
  databasePool,
  queueClient,
  workflowWait,
} = {}) {
  const heartbeat = await writeWorkerHeartbeat(
    databasePool,
    workerId,
    "worker heartbeat from Milestone 8"
  );
  const job = await dequeueDeploymentJob(queueClient);
  let workflow = null;

  if (job?.type === "fake_deployment" && job.deploymentId) {
    workflow = await runFakeDeploymentWorkflow(databasePool, job.deploymentId, {
      wait: workflowWait,
    });
  }

  return {
    heartbeat,
    job,
    workflow,
  };
}

export async function startWorker({
  databasePool = createDatabasePool(),
  queueClient = createQueueClient(),
} = {}) {
  let stopped = false;
  let ticking = false;

  async function tick() {
    if (ticking) {
      return;
    }

    ticking = true;

    try {
      const { job } = await runWorkerOnce({ databasePool, queueClient });

      if (job) {
        logWorker("processed Redis deployment job", { job });
      } else {
        logWorker("heartbeat written; no queued job found");
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          service: "worker",
          milestone: "8",
          workerId,
          message: "worker tick failed",
          error: error.message,
          time: new Date().toISOString(),
        })
      );
    } finally {
      ticking = false;
    }
  }

  logWorker("worker process started");
  await tick();

  const timer = setInterval(() => {
    if (!stopped) {
      void tick();
    }
  }, Math.min(heartbeatIntervalMs, pollIntervalMs));

  return async function stopWorker() {
    stopped = true;
    clearInterval(timer);
    await closeQueueClient(queueClient);
    await closeDatabasePool(databasePool);
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stopWorker = await startWorker();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      logWorker(`received ${signal}, shutting down`);
      await stopWorker();
      process.exit(0);
    });
  }
}
