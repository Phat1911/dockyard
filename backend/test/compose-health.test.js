import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(currentDir, "../../compose.yaml");

test("Milestone 13 compose uses healthchecks and health-based dependencies", async () => {
  const compose = await readFile(composePath, "utf8");

  assert.match(compose, /backend:[\s\S]*?healthcheck:/);
  assert.match(compose, /postgres:[\s\S]*?healthcheck:/);
  assert.match(compose, /redis:[\s\S]*?healthcheck:/);

  assert.match(compose, /pg_isready/);
  assert.match(compose, /redis-cli", "ping"/);
  assert.match(compose, /\/health/);

  assert.match(
    compose,
    /backend:[\s\S]*?depends_on:[\s\S]*?postgres:[\s\S]*?condition: service_healthy/
  );
  assert.match(
    compose,
    /backend:[\s\S]*?depends_on:[\s\S]*?redis:[\s\S]*?condition: service_healthy/
  );
  assert.match(
    compose,
    /worker:[\s\S]*?depends_on:[\s\S]*?backend:[\s\S]*?condition: service_healthy/
  );
  assert.match(
    compose,
    /frontend:[\s\S]*?depends_on:[\s\S]*?backend:[\s\S]*?condition: service_healthy/
  );
});
