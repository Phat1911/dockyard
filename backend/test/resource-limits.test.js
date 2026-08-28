import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  getWorkerStressDurationMs,
  runWorkerStress,
} from "../src/worker.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(currentDir, "../../compose.yaml");

test("Milestone 14 every Compose service has explicit CPU and memory limits", async () => {
  const compose = await readFile(composePath, "utf8");

  for (const service of ["frontend", "backend", "worker", "postgres", "redis"]) {
    const serviceBlock = compose.match(
      new RegExp(`\\n  ${service}:([\\s\\S]*?)(?=\\n  \\w|\\nnetworks:)`)
    )?.[1];

    assert.ok(serviceBlock, `${service} service block must exist`);
    assert.match(serviceBlock, /cpus: [0-9.]+/);
    assert.match(serviceBlock, /mem_limit: \d+[mg]/);
  }
});

test("Milestone 14 worker stress mode defaults off", () => {
  assert.deepEqual(runWorkerStress(), {
    mode: "off",
    iterations: 0,
  });
});

test("Milestone 14 worker CPU stress mode performs bounded work", () => {
  const result = runWorkerStress({
    mode: "cpu",
    durationMs: 5,
  });

  assert.equal(result.mode, "cpu");
  assert.equal(result.durationMs, 5);
  assert.ok(result.iterations > 0);
});

test("Milestone 14 worker CPU stress duration has a small upper bound", () => {
  assert.equal(getWorkerStressDurationMs({ WORKER_STRESS_DURATION_MS: "-1" }), 0);
  assert.equal(
    getWorkerStressDurationMs({ WORKER_STRESS_DURATION_MS: "not-a-number" }),
    0
  );
  assert.equal(getWorkerStressDurationMs({ WORKER_STRESS_DURATION_MS: "25" }), 25);
  assert.equal(
    getWorkerStressDurationMs({ WORKER_STRESS_DURATION_MS: "999999" }),
    5000
  );
});
