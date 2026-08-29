import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = join(currentDir, "../db/migrations");

// Milestone 21: this table records which schema upgrades already ran.
const migrationTableSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

export async function listMigrationFiles(migrationsDir = defaultMigrationsDir) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export async function readAppliedMigrations(pool) {
  await pool.query(migrationTableSql);
  const result = await pool.query("SELECT name FROM schema_migrations");

  return new Set(result.rows.map((row) => row.name));
}

export async function runMigrations(
  pool,
  { migrationsDir = defaultMigrationsDir, logger = console } = {}
) {
  const files = await listMigrationFiles(migrationsDir);
  const applied = await readAppliedMigrations(pool);
  const ran = [];
  const skipped = [];
  const client = pool.connect ? await pool.connect() : pool;

  try {
    for (const file of files) {
      if (applied.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        ran.push(file);
        logger.info?.({ migration: file }, "migration applied");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release?.();
  }

  return {
    total: files.length,
    ran,
    skipped,
  };
}
