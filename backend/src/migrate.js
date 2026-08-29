import { closeDatabasePool, createDatabasePool } from "./db.js";
import { runMigrations } from "./migrations.js";

// Milestone 21: run explicit schema upgrades against existing PostgreSQL data.
const pool = createDatabasePool();

try {
  const result = await runMigrations(pool);
  console.log(
    JSON.stringify(
      {
        message: "database migrations complete",
        ...result,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("database migration failed", error);
  process.exitCode = 1;
} finally {
  await closeDatabasePool(pool);
}
