import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const baseComposePath = resolve(repoRoot, "compose.yaml");
const proxyComposePath = resolve(repoRoot, "compose.proxy.yaml");

function serviceBlock(compose, serviceName) {
  const match = compose.match(
    new RegExp(`\\n  ${serviceName}:([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:|\\nnetworks:|\\nvolumes:|$)`)
  );

  assert.ok(match, `expected ${serviceName} service in Compose file`);
  return match[1];
}

function topLevelNetworksBlock(compose) {
  const match = compose.match(/\nnetworks:([\s\S]*?)(?=\nvolumes:|\nservices:|$)/);

  assert.ok(match, "expected top-level networks in Compose file");
  return match[1];
}

function serviceNetworks(serviceText, serviceName) {
  const match = serviceText.match(/\n    networks:([\s\S]*?)(?=\n    [a-zA-Z0-9_-]+:|\n  [a-z][a-z0-9_-]*:|\nnetworks:|\nvolumes:|$)/);

  assert.ok(match, `expected ${serviceName} to declare explicit networks`);

  return [...match[1].matchAll(/-\s*([a-zA-Z0-9_-]+)/g)].map((network) => network[1]);
}

function assertServiceNetworks(compose, serviceName, expectedNetworks) {
  const actualNetworks = serviceNetworks(serviceBlock(compose, serviceName), serviceName).sort();

  assert.deepEqual(
    actualNetworks,
    [...expectedNetworks].sort(),
    `expected ${serviceName} to be attached only to ${expectedNetworks.join(" and ")}`
  );
}

async function readRequiredFile(filePath, purpose) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(`expected ${purpose} at ${filePath}`);
    }

    throw error;
  }
}

async function firstExistingFile(paths) {
  for (const filePath of paths) {
    try {
      await access(filePath, constants.R_OK);
      return filePath;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  assert.fail(`expected an Nginx proxy config at one of: ${paths.join(", ")}`);
}

function assertNoDockerSocket(text, label) {
  assert.doesNotMatch(text, /\/var\/run\/docker\.sock/, `${label} must not mount Docker socket`);
  assert.doesNotMatch(text, /docker_engine/i, `${label} must not imply Docker Engine access`);
}

test("Milestone 17 proxy Compose adds one public Nginx gateway", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 17 proxy Compose file");
  const nginx = serviceBlock(proxyCompose, "nginx");

  // Milestone 17: Nginx becomes the only browser-facing gateway service.
  assert.match(nginx, /image:\s*nginx|build:/);
  assert.match(nginx, /ports:/);
  assert.match(
    nginx,
    /(?:GATEWAY|NGINX)_HOST_PORT|["']?\d+:(?:80|8080)["']?/,
    "expected nginx to publish a host gateway port"
  );
  assert.match(nginx, /healthcheck:/, "expected nginx to have a Docker healthcheck");
  assert.match(nginx, /depends_on:[\s\S]*frontend:/);
  assert.match(nginx, /depends_on:[\s\S]*backend:/);
  assertNoDockerSocket(proxyCompose, "compose.proxy.yaml");
});

test("Milestone 17 proxy mode removes direct backend publishing", async () => {
  const baseCompose = await readRequiredFile(baseComposePath, "base Compose file");
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 17 proxy Compose file");

  assert.match(serviceBlock(baseCompose, "backend"), /ports:/);

  const backendProxy = serviceBlock(proxyCompose, "backend");
  assert.match(
    backendProxy,
    /ports:\s*!(?:override|reset)\s*(?:\[\]|\n\s*\[\s*\])|ports:\s*(?:\[\]|\n\s*\[\s*\])/,
    "expected proxy override to clear backend host ports"
  );
});

test("Milestone 17 proxy mode adds a frontend healthcheck", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 17 proxy Compose file");
  const frontend = serviceBlock(proxyCompose, "frontend");

  assert.match(frontend, /healthcheck:/);
  assert.match(frontend, /(?:wget|curl|fetch|localhost|127\.0\.0\.1)/);
});

test("Milestone 17 Nginx config routes API and frontend traffic by service name", async () => {
  const proxyConfigPath = await firstExistingFile([
    resolve(repoRoot, "nginx/reverse-proxy.conf"),
    resolve(repoRoot, "nginx/nginx.conf"),
    resolve(repoRoot, "nginx/default.conf"),
  ]);
  const nginxConfig = await readFile(proxyConfigPath, "utf8");

  // Milestone 17: routing uses Docker service names on the Compose network.
  assert.match(nginxConfig, /location\s+(?:\^~\s+)?\/api\/?\s*\{/);
  assert.match(nginxConfig, /proxy_pass\s+http:\/\/backend(?::8080)?\/?/);
  assert.match(nginxConfig, /location\s+\/\s*\{/);
  assert.match(nginxConfig, /proxy_pass\s+http:\/\/frontend(?::8080)?\/?/);
  assertNoDockerSocket(nginxConfig, "Nginx proxy config");
});

test("Milestone 18 proxy mode defines public and private Docker networks", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 18 proxy Compose file");
  const networks = topLevelNetworksBlock(proxyCompose);

  // Milestone 18: split one shared network into browser-facing and internal-only sides.
  assert.match(networks, /\n  public:/, "expected a public network");
  assert.match(networks, /\n  private:/, "expected a private network");
});

test("Milestone 18 proxy mode keeps gateway and frontend only on the public network", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 18 proxy Compose file");

  // Milestone 18: Nginx and frontend should not share a network with data services.
  assertServiceNetworks(proxyCompose, "nginx", ["public"]);
  assertServiceNetworks(proxyCompose, "frontend", ["public"]);
});

test("Milestone 18 proxy mode keeps data and worker services only on the private network", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 18 proxy Compose file");

  // Milestone 18: database/cache/worker stay internal to the private application side.
  assertServiceNetworks(proxyCompose, "postgres", ["private"]);
  assertServiceNetworks(proxyCompose, "redis", ["private"]);
  assertServiceNetworks(proxyCompose, "worker", ["private"]);
});

test("Milestone 18 proxy mode attaches backend to both public and private networks", async () => {
  const proxyCompose = await readRequiredFile(proxyComposePath, "Milestone 18 proxy Compose file");

  // Milestone 18: backend is the bridge between public HTTP traffic and private state.
  assertServiceNetworks(proxyCompose, "backend", ["public", "private"]);
});
