ALTER TABLE sync_runs
  ADD COLUMN trigger_source text NOT NULL DEFAULT 'automatic'
  CHECK (trigger_source IN ('manual', 'automatic'));
