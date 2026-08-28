import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { waitForDependencies } from "../src/health.js";

test("Milestone 13 health returns 200 when PostgreSQL and Redis checks pass", async () => {
  const app = buildServer({
    databasePool: {
      async query(sql) {
        assert.match(sql, /SELECT 1/);
        return { rows: [] };
      },
      end: async () => {},
    },
    queueClient: {
      isOpen: false,
      async connect() {
        this.isOpen = true;
      },
      async ping() {
        return "PONG";
      },
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "healthy");
  assert.equal(response.json().service, "backend");
  assert.equal(response.json().milestone, "13");
  assert.equal(response.json().checks.postgres.reachable, true);
  assert.equal(response.json().checks.redis.reachable, true);

  await app.close();
});

test("Milestone 13 health returns 503 when PostgreSQL check fails", async () => {
  const app = buildServer({
    databasePool: {
      async query() {
        throw new Error("postgres unavailable");
      },
      end: async () => {},
    },
    queueClient: {
      isOpen: true,
      async ping() {
        return "PONG";
      },
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, "unhealthy");
  assert.equal(response.json().checks.postgres.reachable, false);
  assert.equal(response.json().checks.redis.reachable, true);

  await app.close();
});

test("Milestone 13 health returns 503 when Redis check fails", async () => {
  const app = buildServer({
    databasePool: {
      async query() {
        return { rows: [] };
      },
      end: async () => {},
    },
    queueClient: {
      isOpen: true,
      async ping() {
        throw new Error("redis unavailable");
      },
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, "unhealthy");
  assert.equal(response.json().checks.postgres.reachable, true);
  assert.equal(response.json().checks.redis.reachable, false);

  await app.close();
});

test("Milestone 13 dependency retry waits until checks pass", async () => {
  let attempts = 0;

  const result = await waitForDependencies({
    label: "test-service",
    retries: 3,
    delayMs: 1,
    wait: async () => {},
    logger: {
      info: () => {},
      warn: () => {},
    },
    checks: [
      async () => {
        attempts += 1;

        return {
          name: "postgres",
          reachable: attempts >= 2,
        };
      },
    ],
  });

  assert.equal(attempts, 2);
  assert.equal(result[0].reachable, true);
});
