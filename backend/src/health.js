// Milestone 13: shared dependency checks keep service health honest.
export async function checkPostgres(pool) {
  try {
    await pool.query("SELECT 1");

    return {
      name: "postgres",
      status: "healthy",
      reachable: true,
      note: "PostgreSQL answered a simple query.",
    };
  } catch (error) {
    return {
      name: "postgres",
      status: "unhealthy",
      reachable: false,
      note: error.message,
    };
  }
}

export async function checkRedis(client) {
  try {
    if (client.isOpen === false && typeof client.connect === "function") {
      await client.connect();
    }

    await client.ping();

    return {
      name: "redis",
      status: "healthy",
      reachable: true,
      note: "Redis answered PING.",
    };
  } catch (error) {
    return {
      name: "redis",
      status: "unhealthy",
      reachable: false,
      note: error.message,
    };
  }
}

export async function readBackendHealth({ databasePool, queueClient }) {
  const checks = {
    postgres: await checkPostgres(databasePool),
    redis: await checkRedis(queueClient),
  };
  const healthy = checks.postgres.reachable && checks.redis.reachable;

  return {
    status: healthy ? "healthy" : "unhealthy",
    service: "backend",
    milestone: "13",
    checks,
  };
}

export async function waitForDependencies({
  label,
  checks,
  retries = Number(process.env.DEPENDENCY_RETRY_ATTEMPTS || 10),
  delayMs = Number(process.env.DEPENDENCY_RETRY_DELAY_MS || 1000),
  logger = console,
  wait = defaultWait,
}) {
  let lastResults = [];

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    lastResults = await Promise.all(checks.map((check) => check()));

    if (lastResults.every((result) => result.reachable)) {
      logger.info?.(
        { label, attempt, milestone: "13" },
        "dependency checks passed"
      );
      return lastResults;
    }

    logger.warn?.(
      { label, attempt, retries, checks: lastResults, milestone: "13" },
      "dependency checks failed; retrying"
    );

    if (attempt < retries) {
      await wait(delayMs);
    }
  }

  const error = new Error(`${label} dependencies are not ready`);
  error.checks = lastResults;
  throw error;
}

function defaultWait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
