import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";

test("Milestone 1 health endpoint returns ok", async () => {
  const app = buildServer({
    databasePool: {
      end: async () => {},
    },
    queueClient: {
      isOpen: false,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "backend",
    milestone: "1",
  });

  await app.close();
});
