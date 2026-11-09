ALTER TABLE pokemon_resale_sales
  ADD COLUMN IF NOT EXISTS sale_channel varchar(16) NOT NULL DEFAULT 'VINTED';

ALTER TABLE pokemon_resale_sales
  DROP CONSTRAINT IF EXISTS pokemon_resale_sales_channel_check;

ALTER TABLE pokemon_resale_sales
  ADD CONSTRAINT pokemon_resale_sales_channel_check
  CHECK (sale_channel IN ('VINTED', 'PHYSICAL'));
