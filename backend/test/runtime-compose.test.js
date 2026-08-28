import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(currentDir, "../../compose.yaml");
const devComposePath = resolve(currentDir, "../../compose.dev.yaml");

function serviceBlock(compose, serviceName) {
  const match = compose.match(
    new RegExp(`\\n  ${serviceName}:([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:|\\nnetworks:|\\nvolumes:|$)`)
  );

  assert.ok(match, `expected ${serviceName} service in compose file`);
  return match[1];
}

test("Milestone 15 base Compose runs app services from built image targets", async () => {
  const compose = await readFile(composePath, "utf8");

  assert.match(serviceBlock(compose, "frontend"), /target: runtime/);
  assert.match(serviceBlock(compose, "backend"), /target: api/);
  assert.match(serviceBlock(compose, "worker"), /target: worker/);

  for (const service of ["frontend", "backend", "worker"]) {
    const block = serviceBlock(compose, service);

    assert.doesNotMatch(block, /command: sh -c "npm install/);
    assert.doesNotMatch(block, /user: root/);
    assert.doesNotMatch(block, /- \.\/frontend:\/app/);
    assert.doesNotMatch(block, /- \.\/backend:\/app/);
    assert.doesNotMatch(block, /node-modules:\/app\/node_modules/);
  }
});

test("Milestone 15 base Compose keeps only intended runtime-like host ports", async () => {
  const compose = await readFile(composePath, "utf8");

  assert.match(serviceBlock(compose, "frontend"), /\$\{FRONTEND_HOST_PORT:-3000\}:8080/);
  assert.match(
    serviceBlock(compose, "backend"),
    /\$\{BACKEND_HOST_PORT:-8080\}:\$\{BACKEND_PORT:-8080\}/
  );
  assert.doesNotMatch(serviceBlock(compose, "postgres"), /ports:/);
  assert.doesNotMatch(serviceBlock(compose, "redis"), /ports:/);
  assert.doesNotMatch(serviceBlock(compose, "worker"), /ports:/);
});

test("Milestone 15 base Compose does not include dev dependency volumes", async () => {
  const compose = await readFile(composePath, "utf8");

  assert.doesNotMatch(compose, /backend-node-modules:/);
  assert.doesNotMatch(compose, /frontend-node-modules:/);
});

test("Milestone 15 dev override contains the dev-only mounts and Postgres port", async () => {
  const devCompose = await readFile(devComposePath, "utf8");

  assert.match(serviceBlock(devCompose, "frontend"), /target: builder/);
  assert.match(serviceBlock(devCompose, "frontend"), /- \.\/frontend:\/app/);
  assert.match(
    serviceBlock(devCompose, "frontend"),
    /frontend-node-modules:\/app\/node_modules/
  );
  assert.match(serviceBlock(devCompose, "backend"), /- \.\/backend:\/app/);
  assert.match(
    serviceBlock(devCompose, "backend"),
    /backend-node-modules:\/app\/node_modules/
  );
  assert.match(serviceBlock(devCompose, "worker"), /- \.\/backend:\/app/);
  assert.match(
    serviceBlock(devCompose, "worker"),
    /backend-node-modules:\/app\/node_modules/
  );
  assert.match(serviceBlock(devCompose, "postgres"), /\$\{POSTGRES_HOST_PORT:-5432\}:5432/);
});
