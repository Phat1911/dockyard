import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeployment,
  deploymentStatuses,
  runFakeDeploymentWorkflow,
} from "../src/deployments.js";

test("Milestone 8 creates durable deployment before Redis queueing", async () => {
  const queries = [];
  const fakePool = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (/INSERT INTO deployments/.test(sql)) {
        return {
          rows: [
            {
              id: "12",
              name: params[0],
              status: "queued",
              created_at: new Date("2026-08-27T03:00:00.000Z"),
              updated_at: new Date("2026-08-27T03:00:00.000Z"),
            },
          ],
        };
      }

      return {
        rows: [
          {
            id: "1",
            deployment_id: "12",
            level: params[1],
            message: params[2],
            created_at: new Date("2026-08-27T03:00:00.000Z"),
          },
        ],
      };
    },
  };

  const deployment = await createDeployment(fakePool, {
    name: "demo deployment",
  });

  assert.equal(deployment.id, "12");
  assert.equal(deployment.status, "queued");
  assert.match(queries[0].sql, /INSERT INTO deployments/);
  assert.match(queries[1].sql, /INSERT INTO deployment_logs/);
});

test("Milestone 8 fake workflow moves through expected statuses", async () => {
  const statusUpdates = [];
  const logMessages = [];
  const fakePool = {
    async query(sql, params) {
      if (/UPDATE deployments/.test(sql)) {
        statusUpdates.push(params[1]);
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

      if (/INSERT INTO deployment_logs/.test(sql)) {
        logMessages.push(params[2]);
      }

      return {
        rows: [
          {
            id: "1",
          },
        ],
      };
    },
  };

  await runFakeDeploymentWorkflow(fakePool, 12, {
    wait: async () => {},
  });

  assert.deepEqual(statusUpdates, deploymentStatuses.slice(1));
  assert.deepEqual(
    logMessages,
    deploymentStatuses.slice(1).map((status) => `status: ${status}`)
  );
});

test("Milestone 8 fake workflow stops cleanly for missing deployments", async () => {
  const fakePool = {
    async query(sql) {
      if (/UPDATE deployments/.test(sql)) {
        return {
          rows: [],
        };
      }

      throw new Error("should not write deployment logs for missing rows");
    },
  };

  const result = await runFakeDeploymentWorkflow(fakePool, 999, {
    wait: async () => {},
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "deployment not found");
});
