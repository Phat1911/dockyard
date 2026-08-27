import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";

function createDeploymentPool() {
  const queries = [];

  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });

      if (/INSERT INTO deployments/.test(sql)) {
        return {
          rows: [
            {
              id: "21",
              name: params[0],
              status: "queued",
              created_at: new Date("2026-08-27T03:00:00.000Z"),
              updated_at: new Date("2026-08-27T03:00:00.000Z"),
            },
          ],
        };
      }

      if (/INSERT INTO deployment_logs/.test(sql)) {
        return {
          rows: [
            {
              id: "1",
              deployment_id: "21",
              level: params[1],
              message: params[2],
              created_at: new Date("2026-08-27T03:00:00.000Z"),
            },
          ],
        };
      }

      return {
        rows: [],
      };
    },
    async end() {},
  };
}

test("Milestone 8 create deployment endpoint persists before queueing", async () => {
  const databasePool = createDeploymentPool();
  const queueCalls = [];
  const app = buildServer({
    databasePool,
    queueClient: {
      isOpen: false,
      async connect() {
        this.isOpen = true;
      },
      async quit() {
        this.isOpen = false;
      },
      async lPush(key, value) {
        queueCalls.push({ key, value });
      },
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/deployments",
    payload: {
      name: "demo deployment",
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().deployment.status, "queued");
  assert.equal(response.json().queued, true);
  assert.equal(JSON.parse(queueCalls[0].value).deploymentId, 21);
  assert.match(databasePool.queries[0].sql, /INSERT INTO deployments/);
  assert.match(databasePool.queries[1].sql, /INSERT INTO deployment_logs/);

  await app.close();
});
