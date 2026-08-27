import { describeWorkerHeartbeat, readWorkerHeartbeat } from "./heartbeat.js";

// Milestone 9: platform status uses honest app-level checks, not Docker Engine inspection.
export async function readPlatformServices({
  databasePool,
  queueClient,
  workerId,
}) {
  const postgres = await checkPostgres(databasePool);
  const redis = await checkRedis(queueClient);
  const workerRow = postgres.reachable
    ? await readWorkerHeartbeat(databasePool, workerId)
    : null;

  return {
    services: [
      {
        name: "frontend",
        status: "loaded",
        reachable: true,
        note: "Browser loaded the React dashboard.",
      },
      {
        name: "backend",
        status: "responding",
        reachable: true,
        note: "Backend API returned this status response.",
      },
      {
        name: "postgres",
        status: postgres.reachable ? "reachable" : "unreachable",
        reachable: postgres.reachable,
        note: postgres.note,
      },
      {
        name: "redis",
        status: redis.reachable ? "reachable" : "unreachable",
        reachable: redis.reachable,
        note: redis.note,
      },
      {
        name: "worker",
        status: describeWorkerHeartbeat(workerRow).status,
        reachable: describeWorkerHeartbeat(workerRow).fresh,
        note: describeWorkerHeartbeat(workerRow).note,
        heartbeat: describeWorkerHeartbeat(workerRow),
      },
    ],
  };
}

async function checkPostgres(pool) {
  try {
    await pool.query("SELECT 1");

    return {
      reachable: true,
      note: "PostgreSQL answered a simple query.",
    };
  } catch (error) {
    return {
      reachable: false,
      note: error.message,
    };
  }
}

async function checkRedis(client) {
  try {
    if (client.isOpen === false && typeof client.connect === "function") {
      await client.connect();
    }

    await client.ping();

    return {
      reachable: true,
      note: "Redis answered PING.",
    };
  } catch (error) {
    return {
      reachable: false,
      note: error.message,
    };
  }
}
