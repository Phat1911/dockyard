-- Milestone 5: initial PostgreSQL schema for durable Dockyard state.
-- These commands run only when the postgres-data volume is first created.

CREATE TABLE IF NOT EXISTS deployments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deployment_id BIGINT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_heartbeat (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT NOT NULL DEFAULT 'worker registered'
);

CREATE INDEX IF NOT EXISTS deployment_logs_deployment_id_created_at_idx
  ON deployment_logs (deployment_id, created_at);
