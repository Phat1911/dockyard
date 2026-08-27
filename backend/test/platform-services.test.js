import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";

test("Milestone 7 backend reports worker heartbeat freshness from PostgreSQL", async () => {
  const app = buildServer({
    databasePool: {
      async query() {
        return {
          rows: [
            {
              worker_id: "dockyard-worker-1",
              last_seen_at: new Date(),
              note: "worker alive",
            },
          ],
        };
      },
      end: async () => {},
    },
    queueClient: {
      isOpen: false,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/platform-services/worker",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().service, "worker");
  assert.equal(response.json().heartbeat.status, "fresh");
  assert.equal(response.json().heartbeat.workerId, "dockyard-worker-1");

  await app.close();
});
