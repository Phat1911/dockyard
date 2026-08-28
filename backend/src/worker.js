import { fileURLToPath } from "node:url";
import { closeDatabasePool, createDatabasePool } from "./db.js";
import { runFakeDeploymentWorkflow } from "./deployments.js";
import { checkPostgres, checkRedis, waitForDependencies } from "./health.js";
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
const workerStressMode = process.env.WORKER_STRESS_MODE || "off";
const maxWorkerStressDurationMs = 5000;
const workerStressDurationMs = getWorkerStressDurationMs();

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
  stressMode = workerStressMode,
  stressDurationMs = workerStressDurationMs,
} = {}) {
  const heartbeat = await writeWorkerHeartbeat(
    databasePool,
    workerId,
    "worker heartbeat from Milestone 8"
  );

  // Milestone 14: optional CPU stress makes resource limits visible in docker stats.
  const stress = runWorkerStress({ mode: stressMode, durationMs: stressDurationMs });

  const job = await dequeueDeploymentJob(queueClient);
  let workflow = null;

  if (job?.type === "fake_deployment" && job.deploymentId) {
    workflow = await runFakeDeploymentWorkflow(databasePool, job.deploymentId, {
      wait: workflowWait,
    });
  }

  return {
    heartbeat,
    stress,
    job,
    workflow,
  };
}

export function runWorkerStress({ mode = "off", durationMs = 500 } = {}) {
  if (mode !== "cpu") {
    return {
      mode: "off",
      iterations: 0,
    };
  }

  const boundedDurationMs = Math.min(
    Math.max(0, Number(durationMs) || 0),
    maxWorkerStressDurationMs
  );
  const deadline = Date.now() + boundedDurationMs;
  let iterations = 0;
  let value = 0;

  while (Date.now() < deadline) {
    value = Math.sqrt(value + iterations + 1);
    iterations += 1;
  }

  return {
    mode: "cpu",
    durationMs: boundedDurationMs,
    iterations,
  };
}

export function getWorkerStressDurationMs(env = process.env) {
  const parsedDurationMs = Number(env.WORKER_STRESS_DURATION_MS || 500);

  if (!Number.isFinite(parsedDurationMs)) {
    return 0;
  }

  return Math.min(Math.max(0, parsedDurationMs), maxWorkerStressDurationMs);
}

export async function startWorker({
  databasePool = createDatabasePool(),
  queueClient = createQueueClient(),
} = {}) {
  let stopped = false;
  let ticking = false;

  // Milestone 13: worker retries dependency checks before its first tick.
  await waitForDependencies({
    label: "worker",
    checks: [
      () => checkPostgres(databasePool),
      () => checkRedis(queueClient),
    ],
    logger: {
      info: (data, message) => logWorker(message, data),
      warn: (data, message) => logWorker(message, data),
    },
  });

  async function tick() {
    if (ticking) {
      return;
    }

    ticking = true;

    try {
      const { job, stress } = await runWorkerOnce({ databasePool, queueClient });

      if (job) {
        logWorker("processed Redis deployment job", { job, stress });
      } else {
        logWorker("heartbeat written; no queued job found", { stress });
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
