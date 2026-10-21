CREATE TABLE IF NOT EXISTS daily_wealth_history (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day date NOT NULL,
  value_without_pokemon_eur numeric(20,6) NOT NULL,
  value_with_pokemon_eur numeric(20,6) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

