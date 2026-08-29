-- Milestone 21: upgrade existing PostgreSQL volumes without deleting data.
-- Existing deployment rows keep their data and receive the safe default below.

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'local';
