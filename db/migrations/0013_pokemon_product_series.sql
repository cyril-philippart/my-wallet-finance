ALTER TABLE pokemon_inventory_purchases
  ADD COLUMN IF NOT EXISTS series_name varchar(120) NOT NULL DEFAULT 'Non classée';

CREATE INDEX IF NOT EXISTS pokemon_inventory_user_series_product_idx
  ON pokemon_inventory_purchases(user_id, lower(trim(series_name)), lower(trim(product_name)));
