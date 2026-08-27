import { createClient } from "redis";

export const deploymentQueueKey = "dockyard:queue:deployments";

const defaultRedisUrl = "redis://redis:6379";

// Milestone 6: shared Redis client for temporary queue coordination.
export function createQueueClient(redisUrl = process.env.REDIS_URL) {
  return createClient({
    url: redisUrl || defaultRedisUrl,
  });
}

export async function ensureQueueClientConnected(client) {
  if (client && client.isOpen === false && typeof client.connect === "function") {
    await client.connect();
  }
}

export async function closeQueueClient(client) {
  if (client && client.isOpen === true && typeof client.quit === "function") {
    await client.quit();
  }
}

export async function enqueueDeploymentJob(client, job) {
  await ensureQueueClientConnected(client);

  const queuedJob = {
    ...job,
    enqueuedAt: new Date().toISOString(),
  };

  await client.lPush(deploymentQueueKey, JSON.stringify(queuedJob));

  return queuedJob;
}

export async function dequeueDeploymentJob(client) {
  await ensureQueueClientConnected(client);

  const payload = await client.rPop(deploymentQueueKey);

  if (!payload) {
    return null;
  }

  return JSON.parse(payload);
}
