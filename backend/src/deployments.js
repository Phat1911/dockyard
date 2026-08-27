export const deploymentStatuses = [
  "queued",
  "building_image",
  "starting_container",
  "health_checking",
  "running",
];

// Milestone 8: create durable deployment state before queueing Redis work.
export async function createDeployment(pool, { name }) {
  const result = await pool.query(
    `
      INSERT INTO deployments (name, status)
      VALUES ($1, 'queued')
      RETURNING id, name, status, created_at, updated_at
    `,
    [name]
  );

  const deployment = result.rows[0];
  await writeDeploymentLog(pool, deployment.id, "info", "deployment queued");

  return deployment;
}

export async function updateDeploymentStatus(pool, deploymentId, status) {
  const result = await pool.query(
    `
      UPDATE deployments
      SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, name, status, created_at, updated_at
    `,
    [deploymentId, status]
  );

  return result.rows[0] || null;
}

export async function writeDeploymentLog(
  pool,
  deploymentId,
  level,
  message
) {
  const result = await pool.query(
    `
      INSERT INTO deployment_logs (deployment_id, level, message)
      VALUES ($1, $2, $3)
      RETURNING id, deployment_id, level, message, created_at
    `,
    [deploymentId, level, message]
  );

  return result.rows[0];
}

export async function listDeployments(pool) {
  const result = await pool.query(
    `
      SELECT id, name, status, created_at, updated_at
      FROM deployments
      ORDER BY created_at DESC
    `
  );

  return result.rows;
}

export async function readDeploymentWithLogs(pool, deploymentId) {
  const deploymentResult = await pool.query(
    `
      SELECT id, name, status, created_at, updated_at
      FROM deployments
      WHERE id = $1
    `,
    [deploymentId]
  );

  const deployment = deploymentResult.rows[0] || null;

  if (!deployment) {
    return null;
  }

  const logsResult = await pool.query(
    `
      SELECT id, deployment_id, level, message, created_at
      FROM deployment_logs
      WHERE deployment_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [deploymentId]
  );

  return {
    deployment,
    logs: logsResult.rows,
  };
}

export async function runFakeDeploymentWorkflow(
  pool,
  deploymentId,
  { wait = sleep } = {}
) {
  for (const status of deploymentStatuses.slice(1)) {
    const deployment = await updateDeploymentStatus(pool, deploymentId, status);

    if (!deployment) {
      return {
        processed: false,
        reason: "deployment not found",
      };
    }

    await writeDeploymentLog(pool, deploymentId, "info", `status: ${status}`);
    await wait();
  }

  return {
    processed: true,
    status: "running",
  };
}

function sleep() {
  const delayMs = Number(process.env.DEPLOYMENT_STEP_DELAY_MS || 1000);

  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
