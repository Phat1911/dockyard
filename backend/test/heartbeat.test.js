import test from "node:test";
import assert from "node:assert/strict";
import {
  describeWorkerHeartbeat,
  readWorkerHeartbeat,
  writeWorkerHeartbeat,
} from "../src/heartbeat.js";

test("Milestone 7 describes a fresh worker heartbeat", () => {
  const heartbeat = describeWorkerHeartbeat(
    {
      worker_id: "dockyard-worker-1",
      last_seen_at: "2026-08-27T03:00:00.000Z",
      note: "worker alive",
    },
    {
      now: new Date("2026-08-27T03:00:05.000Z"),
      staleAfterMs: 30000,
    }
  );

  assert.equal(heartbeat.status, "fresh");
  assert.equal(heartbeat.fresh, true);
  assert.equal(heartbeat.ageMs, 5000);
});

test("Milestone 7 describes stale and missing worker heartbeats", () => {
  const staleHeartbeat = describeWorkerHeartbeat(
    {
      worker_id: "dockyard-worker-1",
      last_seen_at: "2026-08-27T03:00:00.000Z",
      note: "worker alive",
    },
    {
      now: new Date("2026-08-27T03:01:00.000Z"),
      staleAfterMs: 30000,
    }
  );

  const missingHeartbeat = describeWorkerHeartbeat(null, {
    staleAfterMs: 30000,
  });

  assert.equal(staleHeartbeat.status, "stale");
  assert.equal(staleHeartbeat.fresh, false);
  assert.equal(missingHeartbeat.status, "missing");
  assert.equal(missingHeartbeat.fresh, false);
});

test("Milestone 7 writes and reads worker heartbeat rows", async () => {
  const queries = [];
  const fakePool = {
    async query(sql, params) {
      queries.push({ sql, params });

      return {
        rows: [
          {
            worker_id: params[0],
            last_seen_at: new Date("2026-08-27T03:00:00.000Z"),
            note: params[1] || "worker alive",
          },
        ],
      };
    },
  };

  const written = await writeWorkerHeartbeat(
    fakePool,
    "dockyard-worker-1",
    "worker alive"
  );
  const read = await readWorkerHeartbeat(fakePool, "dockyard-worker-1");

  assert.equal(written.worker_id, "dockyard-worker-1");
  assert.equal(read.worker_id, "dockyard-worker-1");
  assert.match(queries[0].sql, /INSERT INTO worker_heartbeat/);
  assert.match(queries[1].sql, /SELECT worker_id/);
});
