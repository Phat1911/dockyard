import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { deploymentQueueKey } from "../src/queue.js";

function createFakeQueueClient() {
  const items = [];

  return {
    isOpen: false,
    connected: false,
    quitCalled: false,
    async connect() {
      this.isOpen = true;
      this.connected = true;
    },
    async quit() {
      this.isOpen = false;
      this.quitCalled = true;
    },
    async lPush(_key, value) {
      items.unshift(value);
    },
    async rPop(_key) {
      return items.pop() || null;
    },
  };
}

test("Milestone 6 queues and pops a deployment job through Redis client methods", async () => {
  const queueClient = createFakeQueueClient();
  const app = buildServer({
    databasePool: {
      end: async () => {},
    },
    queueClient,
  });

  const enqueueResponse = await app.inject({
    method: "POST",
    url: "/queue/deployment-jobs",
    payload: {
      deploymentId: 42,
    },
  });

  assert.equal(enqueueResponse.statusCode, 202);
  assert.equal(enqueueResponse.json().queued, true);
  assert.equal(enqueueResponse.json().queue, deploymentQueueKey);
  assert.equal(enqueueResponse.json().job.deploymentId, 42);
  assert.equal(enqueueResponse.json().job.type, "fake_deployment");
  assert.equal(queueClient.connected, true);

  const dequeueResponse = await app.inject({
    method: "GET",
    url: "/queue/deployment-jobs/next",
  });

  assert.equal(dequeueResponse.statusCode, 200);
  assert.equal(dequeueResponse.json().job.deploymentId, 42);

  await app.close();

  assert.equal(queueClient.quitCalled, true);
});

test("Milestone 6 rejects queue jobs without a positive deployment id", async () => {
  const app = buildServer({
    databasePool: {
      end: async () => {},
    },
    queueClient: createFakeQueueClient(),
  });

  const response = await app.inject({
    method: "POST",
    url: "/queue/deployment-jobs",
    payload: {
      deploymentId: 0,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "deploymentId must be a positive integer");

  await app.close();
});
