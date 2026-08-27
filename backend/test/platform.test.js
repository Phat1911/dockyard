import test from "node:test";
import assert from "node:assert/strict";
import { readPlatformServices } from "../src/platform.js";

test("Milestone 9 reports platform services from app-level checks", async () => {
  const services = await readPlatformServices({
    databasePool: {
      async query(sql) {
        if (/SELECT worker_id/.test(sql)) {
          return {
            rows: [
              {
                worker_id: "dockyard-worker-1",
                last_seen_at: new Date(),
                note: "worker alive",
              },
            ],
          };
        }

        return {
          rows: [],
        };
      },
    },
    queueClient: {
      isOpen: false,
      async connect() {
        this.isOpen = true;
      },
      async ping() {
        return "PONG";
      },
    },
    workerId: "dockyard-worker-1",
  });

  assert.deepEqual(
    services.services.map((service) => service.name),
    ["frontend", "backend", "postgres", "redis", "worker"]
  );
  assert.equal(
    services.services.find((service) => service.name === "postgres").status,
    "reachable"
  );
  assert.equal(
    services.services.find((service) => service.name === "redis").status,
    "reachable"
  );
  assert.equal(
    services.services.find((service) => service.name === "worker").status,
    "fresh"
  );
});
