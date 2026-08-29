import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const registryComposePath = resolve(repoRoot, "compose.registry.yaml");
const envExamplePath = resolve(repoRoot, ".env.example");
const readmePath = resolve(repoRoot, "README.md");
const commandsPath = resolve(repoRoot, "COMMANDS.md");

function serviceBlock(compose, serviceName) {
  const match = compose.match(
    new RegExp(`\\n  ${serviceName}:([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:|\\nvolumes:|\\nnetworks:|$)`)
  );

  assert.ok(match, `expected ${serviceName} service in Compose file`);
  return match[1];
}

test("Milestone 20 registry Compose runs a local registry server", async () => {
  const compose = await readFile(registryComposePath, "utf8");
  const envExample = await readFile(envExamplePath, "utf8");
  const registry = serviceBlock(compose, "registry");

  // Milestone 20: registry:2 is the local image storage service.
  assert.match(registry, /image:\s*registry:2/);
  assert.match(registry, /ports:[\s\S]*\$\{REGISTRY_HOST_PORT:-5000\}:5000/);
  assert.match(envExample, /REGISTRY_HOST_PORT=5000/);
  assert.match(registry, /restart:\s*["']?on-failure:3["']?/);
});

test("Milestone 20 registry storage is explicit and does not mount Docker socket", async () => {
  const compose = await readFile(registryComposePath, "utf8");
  const registry = serviceBlock(compose, "registry");

  // Milestone 20: pushed image blobs live in a registry volume, not in app state.
  assert.match(registry, /registry-data:\/var\/lib\/registry/);
  assert.match(compose, /\nvolumes:[\s\S]*\n  registry-data:/);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/);
});

test("Milestone 20 docs include manual tag push pull and image inspection flow", async () => {
  const readme = await readFile(readmePath, "utf8");
  const commands = await readFile(commandsPath, "utf8");
  const docs = `${readme}\n${commands}`;

  assert.match(docs, /registry versus Git|registry vs Git|Git repo/i);
  assert.match(docs, /localhost:5000\/dockyard-api:milestone-20/);
  assert.match(docs, /docker compose -f compose\.registry\.yaml config/);
  assert.match(docs, /docker compose -f compose\.registry\.yaml up -d/);
  assert.match(docs, /docker tag dockyard-api:dev localhost:5000\/dockyard-api:milestone-20/);
  assert.match(docs, /docker push localhost:5000\/dockyard-api:milestone-20/);
  assert.match(docs, /docker pull localhost:5000\/dockyard-api:milestone-20/);
  assert.match(docs, /docker images/);
  assert.match(docs, /Run this yourself|run these commands yourself/i);
});
