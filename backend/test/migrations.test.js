import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listMigrationFiles,
  readAppliedMigrations,
  runMigrations,
} from "../src/migrations.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const readmePath = resolve(repoRoot, "README.md");
const commandsPath = resolve(repoRoot, "COMMANDS.md");

test("Milestone 21 lists SQL migrations in deterministic order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dockyard-migrations-"));

  try {
    await writeFile(join(dir, "002_second.sql"), "SELECT 2;");
    await writeFile(join(dir, "001_first.sql"), "SELECT 1;");
    await writeFile(join(dir, "README.md"), "not a migration");

    assert.deepEqual(await listMigrationFiles(dir), [
      "001_first.sql",
      "002_second.sql",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Milestone 21 records applied migrations and skips them later", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dockyard-migrations-"));

  try {
    await writeFile(
      join(dir, "001_add_column.sql"),
      "ALTER TABLE deployments ADD COLUMN IF NOT EXISTS environment TEXT;"
    );

    const queries = [];
    const client = {
      releaseCalled: false,
      async query(sql, params = []) {
        queries.push({ sql, params });
        return { rows: [] };
      },
      release() {
        this.releaseCalled = true;
      },
    };
    const pool = {
      async query(sql) {
        queries.push({ sql, params: [] });
        return { rows: [] };
      },
      async connect() {
        return client;
      },
    };

    const result = await runMigrations(pool, {
      migrationsDir: dir,
      logger: { info() {} },
    });

    assert.deepEqual(result.ran, ["001_add_column.sql"]);
    assert.deepEqual(result.skipped, []);
    assert.equal(client.releaseCalled, true);
    assert.match(
      queries.map((query) => query.sql).join("\n"),
      /CREATE TABLE IF NOT EXISTS schema_migrations/
    );
    assert.deepEqual(
      queries
        .filter(
          (query) =>
            query.sql === "INSERT INTO schema_migrations (name) VALUES ($1)"
        )
        .map((query) => query.params[0]),
      ["001_add_column.sql"]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Milestone 21 reads applied migration names from schema_migrations", async () => {
  const pool = {
    async query(sql) {
      if (/SELECT name FROM schema_migrations/.test(sql)) {
        return {
          rows: [{ name: "001_done.sql" }],
        };
      }

      return { rows: [] };
    },
  };

  const applied = await readAppliedMigrations(pool);

  assert.equal(applied.has("001_done.sql"), true);
});

test("Milestone 21 migration SQL preserves existing rows with a safe default", async () => {
  const sql = await readFile(
    new URL(
      "../db/migrations/001_milestone_21_deployment_environment.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(sql, /ALTER TABLE deployments/);
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'local'/
  );
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM deployments/i);
});

test("Milestone 21 exposes npm run migrate for Docker Compose exec", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );

  // Milestone 21: users run this inside the backend container.
  assert.equal(packageJson.scripts.migrate, "node src/migrate.js");
});

test("Milestone 21 docs warn not to use down -v for schema upgrades", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  const commands = await readFile(
    new URL("../../COMMANDS.md", import.meta.url),
    "utf8"
  );
  const docs = `${readme}\n${commands}`;

  assert.match(docs, /docker compose exec backend npm run migrate/);
  assert.match(docs, /schema_migrations/);
  assert.match(docs, /idempotent|safe to run again/i);
  assert.match(docs, /do not use `?docker compose down -v`?/i);
  assert.match(docs, /schema upgrades?|database migrations?/i);
  assert.match(docs, /deletes? .*PostgreSQL.*volume|PostgreSQL.*volume.*deletes?/i);
});

test("Milestone 21 docs use migrations instead of destructive volume deletion", async () => {
  const readme = await readFile(readmePath, "utf8");
  const commands = await readFile(commandsPath, "utf8");
  const docs = `${readme}\n${commands}`;

  assert.match(docs, /docker compose exec backend npm run migrate/);
  assert.match(docs, /schema_migrations/);
  assert.match(docs, /deployments\.environment|environment column/);
  assert.match(docs, /Do not use `?docker compose down -v`? for schema upgrades/i);
  assert.match(docs, /deletes the PostgreSQL named volume/i);
});
