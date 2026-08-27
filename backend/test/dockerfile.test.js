import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dockerfilePath = resolve(currentDir, "../Dockerfile");

test("Milestone 11 backend Dockerfile has explicit api and worker targets", async () => {
  const dockerfile = await readFile(dockerfilePath, "utf8");

  assert.match(dockerfile, /FROM node:22-slim AS deps/);
  assert.match(dockerfile, /RUN npm ci --omit=dev/);
  assert.match(dockerfile, /FROM node:22-slim AS runtime-base/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /FROM runtime-base AS api/);
  assert.match(dockerfile, /CMD \["npm", "start"\]/);
  assert.match(dockerfile, /FROM runtime-base AS worker/);
  assert.match(dockerfile, /CMD \["npm", "run", "worker"\]/);
});
