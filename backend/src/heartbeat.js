const defaultFreshAfterMs = 30000;

// Milestone 7: worker liveness is stored as application data in PostgreSQL.
export async function writeWorkerHeartbeat(pool, workerId, note = "worker alive") {
  const result = await pool.query(
    `
      INSERT INTO worker_heartbeat (worker_id, last_seen_at, note)
      VALUES ($1, now(), $2)
      ON CONFLICT (worker_id)
      DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        note = excluded.note
      RETURNING worker_id, last_seen_at, note
    `,
    [workerId, note]
  );

  return result.rows[0];
}

export async function readWorkerHeartbeat(pool, workerId) {
  const result = await pool.query(
    `
      SELECT worker_id, last_seen_at, note
      FROM worker_heartbeat
      WHERE worker_id = $1
    `,
    [workerId]
  );

  return result.rows[0] || null;
}

export function describeWorkerHeartbeat(
  row,
  {
    now = new Date(),
    staleAfterMs = Number(process.env.WORKER_HEARTBEAT_STALE_AFTER_MS) ||
      defaultFreshAfterMs,
  } = {}
) {
  if (!row) {
    return {
      status: "missing",
      fresh: false,
      workerId: null,
      lastSeenAt: null,
      ageMs: null,
      staleAfterMs,
      note: "worker has not written a heartbeat yet",
    };
  }

  const lastSeenAt = new Date(row.last_seen_at);
  const ageMs = Math.max(0, now.getTime() - lastSeenAt.getTime());
  const fresh = ageMs <= staleAfterMs;

  return {
    status: fresh ? "fresh" : "stale",
    fresh,
    workerId: row.worker_id,
    lastSeenAt: lastSeenAt.toISOString(),
    ageMs,
    staleAfterMs,
    note: row.note,
  };
}
