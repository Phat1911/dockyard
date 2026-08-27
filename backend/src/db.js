import pg from "pg";

const { Pool } = pg;

const defaultDatabaseUrl =
  "postgres://dockyard:dockyard_dev_password@postgres:5432/dockyard";

// Milestone 5: shared PostgreSQL connection pool for durable Dockyard state.
export function createDatabasePool(databaseUrl = process.env.DATABASE_URL) {
  return new Pool({
    connectionString: databaseUrl || defaultDatabaseUrl,
  });
}

export async function closeDatabasePool(pool) {
  if (pool) {
    await pool.end();
  }
}
