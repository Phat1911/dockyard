import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const frontendDockerfilePath = resolve(currentDir, "../../frontend/Dockerfile");
const frontendDockerignorePath = resolve(currentDir, "../../frontend/.dockerignore");
const frontendNginxConfigPath = resolve(currentDir, "../../frontend/nginx.conf");
const composePath = resolve(currentDir, "../../compose.yaml");

test("Milestone 12 frontend runtime image serves built static assets only", async () => {
  const dockerfile = await readFile(frontendDockerfilePath, "utf8");

  assert.match(dockerfile, /FROM node:22-slim AS builder/);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /FROM nginx:alpine AS runtime/);
  assert.match(
    dockerfile,
    /COPY --from=builder \/app\/dist \/usr\/share\/nginx\/html/
  );

  const runtimeStage = dockerfile.split(/FROM nginx:alpine AS runtime/)[1];

  assert.ok(runtimeStage, "runtime stage must exist");
  assert.doesNotMatch(runtimeStage, /npm (install|ci|run)/);
  assert.doesNotMatch(runtimeStage, /\bnode_modules\b/);
  assert.doesNotMatch(runtimeStage, /\bvite\b/i);
  assert.doesNotMatch(runtimeStage, /COPY package.*\.json/);
  assert.doesNotMatch(runtimeStage, /COPY \. /);
  assert.match(runtimeStage, /USER nginx/);
  assert.match(runtimeStage, /EXPOSE 8080/);
});

test("Milestone 12 frontend context excludes local secrets and build leftovers", async () => {
  const dockerignore = await readFile(frontendDockerignorePath, "utf8");
  const ignoredEntries = dockerignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  assert.ok(ignoredEntries.includes(".env"));
  assert.ok(ignoredEntries.includes(".env.*"));
  assert.ok(ignoredEntries.includes("node_modules"));
  assert.ok(ignoredEntries.includes("dist"));
  assert.ok(ignoredEntries.includes("build"));
  assert.ok(ignoredEntries.includes("coverage"));
  assert.ok(ignoredEntries.includes("*.log"));
  assert.ok(ignoredEntries.includes(".git"));
});

test("Milestone 12 frontend Nginx runtime listens on an unprivileged port", async () => {
  const [nginxConfig, compose] = await Promise.all([
    readFile(frontendNginxConfigPath, "utf8"),
    readFile(composePath, "utf8"),
  ]);

  assert.match(nginxConfig, /listen 8080;/);
  assert.match(nginxConfig, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginxConfig, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(compose, /\$\{FRONTEND_HOST_PORT:-3000\}:8080/);
});
