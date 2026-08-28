import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");

async function readDocs() {
  const files = ["README.md", "COMMANDS.md", "MILESTONE_16_DEBUGGING.md"];
  const contents = await Promise.all(
    files.map(async (file) => readFile(resolve(repoRoot, file), "utf8"))
  );

  return contents.join("\n").toLowerCase();
}

function milestone16Text(docs) {
  const milestoneIndex = docs.indexOf("milestone 16");

  assert.ok(
    milestoneIndex >= 0,
    "expected README.md or COMMANDS.md to contain a Milestone 16 section"
  );

  return docs.slice(milestoneIndex);
}

test("Milestone 16 documents each controlled debugging exercise", async () => {
  const docs = milestone16Text(await readDocs());

  assert.match(docs, /milestone 16/);

  // Milestone 16: Debugging Exercises Pack 1.
  assert.match(docs, /wrong\s+port\s+mapping/);
  assert.match(docs, /wrong\s+`?database_url`?\s+hostname/);
  assert.match(docs, /localhost/);
  assert.match(docs, /postgres/);
  assert.match(docs, /redis\s+restart(?:\/recreate)?\s+loses?\s+(queued\s+)?jobs/);
  assert.match(docs, /worker\s+heartbeat\s+stale|stale\s+worker\s+heartbeat/);
  assert.match(docs, /postgresql\s+container\s+deletion\s+versus\s+volume\s+deletion/);
});

test("Milestone 16 includes diagnosis commands from the plan", async () => {
  const docs = milestone16Text(await readDocs());

  for (const command of [
    "docker compose logs",
    "docker compose ps",
    "docker inspect",
    "docker volume ls",
  ]) {
    assert.ok(docs.includes(command), `expected documented command: ${command}`);
  }
});

test("Milestone 16 exercises include reversible fixes and avoid Docker Engine control", async () => {
  const docs = milestone16Text(await readDocs());

  assert.match(docs, /fix|restore|revert|turn it back/);
  assert.match(docs, /docker compose down -v/);
  assert.match(docs, /be careful|warning|danger|delete[s]? the postgresql.*volume/);
  assert.match(docs, /postgresql.*durable|durable.*postgresql/);
  assert.match(docs, /redis.*temporary|temporary.*redis/);
  assert.doesNotMatch(docs, /\/var\/run\/docker\.sock/);
});
