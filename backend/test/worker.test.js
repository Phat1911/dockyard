import test from "node:test";
import assert from "node:assert/strict";
import { runWorkerOnce } from "../src/worker.js";

test("Milestone 7 worker writes heartbeat and consumes one Redis job", async () => {
  const workflowQueries = [];
  const fakePool = {
    async query(sql, params = []) {
      workflowQueries.push({ sql, params });

      if (/UPDATE deployments/.test(sql)) {
        return {
          rows: [
            {
              id: String(params[0]),
              name: "demo deployment",
              status: params[1],
            },
          ],
        };
      }

      return {
        rows: [
          {
            worker_id: "dockyard-worker-1",
            last_seen_at: new Date("2026-08-27T03:00:00.000Z"),
            note: "worker heartbeat from Milestone 7",
          },
        ],
      };
    },
  };
  const fakeQueueClient = {
    isOpen: false,
    connected: false,
    async connect() {
      this.isOpen = true;
      this.connected = true;
    },
    async rPop() {
      return JSON.stringify({
        deploymentId: 7,
        type: "fake_deployment",
      });
    },
  };

  const result = await runWorkerOnce({
    databasePool: fakePool,
    queueClient: fakeQueueClient,
    workflowWait: async () => {},
  });

  assert.equal(result.heartbeat.worker_id, "dockyard-worker-1");
  assert.equal(result.job.deploymentId, 7);
  assert.equal(fakeQueueClient.connected, true);
  assert.equal(
    workflowQueries.filter(({ sql }) => /UPDATE deployments/.test(sql)).length,
    4
  );
  assert.equal(result.workflow.processed, true);
});
