CREATE UNIQUE INDEX assets_category_external_symbol_uq
  ON assets(category,upper(external_symbol))
  WHERE external_symbol IS NOT NULL;
