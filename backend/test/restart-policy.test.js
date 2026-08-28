import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const baseComposePath = resolve(repoRoot, "compose.yaml");
const proxyComposePath = resolve(repoRoot, "compose.proxy.yaml");
const readmePath = resolve(repoRoot, "README.md");
const commandsPath = resolve(repoRoot, "COMMANDS.md");

function serviceBlock(compose, serviceName) {
  const match = compose.match(
    new RegExp(`\\n  ${serviceName}:([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:|\\nnetworks:|\\nvolumes:|$)`)
  );

  assert.ok(match, `expected ${serviceName} service in Compose file`);
  return match[1];
}

test("Milestone 19 every service uses a bounded restart policy", async () => {
  const compose = await readFile(baseComposePath, "utf8");

  for (const service of ["frontend", "backend", "worker", "postgres", "redis"]) {
    const block = serviceBlock(compose, service);

    // Milestone 19: bounded retries avoid making repeated crashes look healthy forever.
    assert.match(
      block,
      /restart:\s*["']?on-failure:3["']?/,
      `expected ${service} to restart only on failure with a visible retry limit`
    );
  }
});

test("Milestone 19 restart policies do not use infinite recovery modes", async () => {
  const baseCompose = await readFile(baseComposePath, "utf8");
  const proxyCompose = await readFile(proxyComposePath, "utf8");
  const compose = `${baseCompose}\n${proxyCompose}`;

  // Milestone 19: avoid policies that can make repeated crashes look normal at a glance.
  assert.doesNotMatch(compose, /restart:\s*["']?always["']?/);
  assert.doesNotMatch(compose, /restart:\s*["']?unless-stopped["']?/);
});

test("Milestone 19 proxy gateway uses the same bounded restart policy", async () => {
  const compose = await readFile(proxyComposePath, "utf8");
  const nginx = serviceBlock(compose, "nginx");

  // Milestone 19: the public gateway can recover from crashes without looping forever.
  assert.match(nginx, /restart:\s*["']?on-failure:3["']?/);
});

test("Milestone 19 docs explain exits, unhealthy status, and crash loops", async () => {
  const readme = await readFile(readmePath, "utf8");
  const commands = await readFile(commandsPath, "utf8");
  const docs = `${readme}\n${commands}`;

  assert.match(docs, /restart polic(?:y|ies)/i);
  assert.match(docs, /on-failure:3/);
  assert.match(docs, /exit/i);
  assert.match(docs, /unhealthy/i);
  assert.match(docs, /crash loop/i);
  assert.match(docs, /RestartCount/);
  assert.match(docs, /hiding repeated failures|failure stays visible|crashes are still visible/i);
  assert.match(docs, /docker compose ps/);
  assert.match(docs, /docker compose logs(?: --tail=\d+)? worker/);
  assert.match(docs, /docker inspect dockyard-worker-1/);
});
