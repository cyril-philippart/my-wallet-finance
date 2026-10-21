CREATE TABLE IF NOT EXISTS zebradex_summary_cache (
  context_id text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
