ALTER TABLE portfolio_assets
  ALTER CONSTRAINT portfolio_assets_portfolio_id_category_fkey DEFERRABLE INITIALLY IMMEDIATE,
  ALTER CONSTRAINT portfolio_assets_asset_id_category_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE transactions
  ALTER CONSTRAINT transactions_portfolio_id_asset_id_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE cash_movements
  ALTER CONSTRAINT cash_movements_transaction_id_portfolio_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
