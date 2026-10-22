CREATE TABLE IF NOT EXISTS pokemon_inventory_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  purchased_on date NOT NULL,
  product_name varchar(180) NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK(quantity > 0),
  unit_cost_eur numeric(18,6) NOT NULL CHECK(unit_cost_eur >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pokemon_resale_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sold_on date NOT NULL,
  description varchar(180) NOT NULL,
  sale_total_eur numeric(18,6) NOT NULL CHECK(sale_total_eur >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pokemon_resale_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES pokemon_resale_sales(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES pokemon_inventory_purchases(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK(quantity > 0),
  unit_cost_eur numeric(18,6) NOT NULL CHECK(unit_cost_eur >= 0)
);
CREATE TABLE IF NOT EXISTS pokemon_trading_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action varchar(16) NOT NULL CHECK (action IN ('BUY','SELL','MODIFIED','DELETED')), occurred_on date NOT NULL,
  product_name varchar(180) NOT NULL, quantity numeric(18,6), unit_price_eur numeric(18,6), amount_eur numeric(18,6),
  reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pokemon_inventory_user_date_idx ON pokemon_inventory_purchases(user_id,purchased_on,id);
CREATE INDEX IF NOT EXISTS pokemon_resale_sales_user_date_idx ON pokemon_resale_sales(user_id,sold_on DESC);
CREATE INDEX IF NOT EXISTS pokemon_resale_items_sale_idx ON pokemon_resale_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS pokemon_trading_events_user_date_idx ON pokemon_trading_events(user_id,created_at DESC);
