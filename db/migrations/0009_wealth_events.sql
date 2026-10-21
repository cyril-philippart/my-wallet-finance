CREATE TABLE IF NOT EXISTS wealth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  event_day date NOT NULL,
  title varchar(120) NOT NULL,
  description text,
  event_type varchar(20) NOT NULL CHECK(event_type IN('MARKET','NEWS','POKEMON','NOTE')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wealth_events_user_day_idx ON wealth_events(user_id,event_day);
