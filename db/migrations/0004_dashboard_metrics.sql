ALTER TABLE app_preferences
  ADD COLUMN IF NOT EXISTS available_capital_eur numeric(28,12) NOT NULL DEFAULT 0
  CHECK (available_capital_eur >= 0);

CREATE TABLE IF NOT EXISTS market_benchmarks (
  id text PRIMARY KEY,
  name text NOT NULL,
  ticker text NOT NULL UNIQUE,
  currency currency_code NOT NULL,
  display_order smallint NOT NULL
);

CREATE TABLE IF NOT EXISTS market_benchmark_prices (
  benchmark_id text NOT NULL REFERENCES market_benchmarks(id),
  price numeric(28,12) NOT NULL CHECK (price > 0),
  observed_at timestamptz,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (benchmark_id, fetched_at)
);

CREATE INDEX IF NOT EXISTS market_benchmark_prices_latest
  ON market_benchmark_prices(benchmark_id, fetched_at DESC);

INSERT INTO market_benchmarks(id,name,ticker,currency,display_order) VALUES
  ('cac40','CAC 40','INDEXEURO:PX1','EUR',1),
  ('nasdaq','Nasdaq Composite','INDEXNASDAQ:.IXIC','USD',2),
  ('sp500','S&P 500','INDEXSP:.INX','USD',3),
  ('bitcoin','Bitcoin','BTCEUR','EUR',4),
  ('ethereum','Ethereum','ETHEUR','EUR',5)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,ticker=excluded.ticker,currency=excluded.currency,display_order=excluded.display_order;
