import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";

test("Milestone 5 backend decorates Fastify with a database pool", async () => {
  const fakePool = {
    ended: false,
    async end() {
      this.ended = true;
    },
  };

  const app = buildServer({
    databasePool: fakePool,
    queueClient: {
      isOpen: false,
    },
  });

  assert.equal(app.db, fakePool);

  await app.close();

  assert.equal(fakePool.ended, true);
});
