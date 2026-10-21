-- My Wallet Finance V1.2 — PostgreSQL 16+; schéma de référence révisé 14-10-2026
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE DOMAIN currency_code AS varchar(3)
  CHECK (VALUE ~ '^[A-Z]{3}$');
CREATE TYPE asset_class AS ENUM ('EQUITY','ETF','CRYPTO','SCPI','LIFE_INSURANCE','OTHER');
CREATE TYPE trade_kind AS ENUM ('BUY','SELL','DIVIDEND','CONTRIBUTION','WITHDRAWAL','ADJUSTMENT');
CREATE TYPE price_origin AS ENUM ('GOOGLEFINANCE','CRYPTO_PROVIDER','MANUAL','IMPORT');
CREATE TYPE funds_destination AS ENUM ('EXTERNAL','TECHNICAL_CASH');
CREATE TYPE acquisition_source AS ENUM ('EXTERNAL','TECHNICAL_CASH','MIXED');
CREATE TYPE cash_movement_kind AS ENUM ('BUY_FUNDING','SALE_PROCEEDS','DIVIDEND','EXTERNAL_CONTRIBUTION','EXTERNAL_WITHDRAWAL','CORRECTION');
CREATE TYPE import_state AS ENUM ('PENDING','VALIDATED','COMMITTED','FAILED');
CREATE TYPE snapshot_status AS ENUM ('READY','ESTIMATED','INCOMPLETE','STALE','INVALIDATED');
CREATE TYPE observation_status AS ENUM ('OBSERVED','OBSERVATION_TIME_UNKNOWN');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), login text NOT NULL UNIQUE,
  password_hash text NOT NULL, totp_secret_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
  name text NOT NULL, category asset_class NOT NULL, base_currency currency_code NOT NULL DEFAULT 'EUR',
  color text, opened_on date, tracking_starts_on date, archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,name), UNIQUE(id,category)
);
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category asset_class NOT NULL,
  name text NOT NULL, isin text, google_ticker text, external_symbol text,
  exchange_code text, quote_currency currency_code NOT NULL, precision_scale smallint NOT NULL DEFAULT 8,
  pricing_method text NOT NULL DEFAULT 'MANUAL' CHECK(pricing_method IN ('GOOGLEFINANCE','CRYPTO_PROVIDER','MANUAL')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,category),
  CHECK(precision_scale BETWEEN 0 AND 18)
);
CREATE UNIQUE INDEX assets_google_symbol_uq ON assets(google_ticker) WHERE google_ticker IS NOT NULL;
CREATE TABLE portfolio_assets (
  portfolio_id uuid NOT NULL, asset_id uuid NOT NULL, category asset_class NOT NULL,
  PRIMARY KEY(portfolio_id,asset_id),
  FOREIGN KEY(portfolio_id,category) REFERENCES portfolios(id,category),
  FOREIGN KEY(asset_id,category) REFERENCES assets(id,category)
);
CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
  filename text NOT NULL, sha256 char(64), state import_state NOT NULL DEFAULT 'PENDING',
  report jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), committed_at timestamptz
);
CREATE UNIQUE INDEX committed_import_file_uq ON import_batches(user_id,sha256)
  WHERE state = 'COMMITTED' AND sha256 IS NOT NULL;
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL REFERENCES portfolios(id), asset_id uuid,
  kind trade_kind NOT NULL, occurred_at timestamptz NOT NULL,
  sequence_number bigint NOT NULL,
  quantity numeric(30,18), unit_price numeric(28,12), fees numeric(28,12) NOT NULL DEFAULT 0,
  gross_amount numeric(28,12), taxes numeric(28,12) NOT NULL DEFAULT 0,
  net_amount numeric(28,12), currency currency_code NOT NULL,
  fx_to_eur numeric(28,14), -- EUR obtenus pour 1 unité de currency à la date de l'opération
  -- Choix explicite enregistrés avec la transaction, jamais déduits après coup :
  sale_destination funds_destination,
  dividend_destination funds_destination,
  buy_source acquisition_source,
  -- Si MIXED, montant pris dans la réserve en devise de transaction.
  technical_cash_used numeric(28,12) NOT NULL DEFAULT 0 CHECK(technical_cash_used >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id uuid REFERENCES import_batches(id), import_source_key text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(portfolio_id,asset_id) REFERENCES portfolio_assets(portfolio_id,asset_id),
  UNIQUE(id,portfolio_id),
  CHECK(fees >= 0 AND taxes >= 0),
  CHECK((kind IN ('BUY','SELL') AND asset_id IS NOT NULL AND quantity > 0 AND unit_price >= 0)
     OR (kind = 'DIVIDEND' AND asset_id IS NOT NULL AND quantity IS NULL)
     OR (kind IN ('CONTRIBUTION','WITHDRAWAL','ADJUSTMENT') AND quantity IS NULL)),
  CHECK((kind = 'SELL' AND sale_destination IS NOT NULL) OR (kind <> 'SELL' AND sale_destination IS NULL)),
  CHECK((kind = 'DIVIDEND' AND dividend_destination IS NOT NULL) OR (kind <> 'DIVIDEND' AND dividend_destination IS NULL)),
  CHECK((kind = 'BUY' AND buy_source IS NOT NULL) OR (kind <> 'BUY' AND buy_source IS NULL)),
  CHECK((kind = 'BUY' AND buy_source IN ('TECHNICAL_CASH','MIXED')) OR technical_cash_used = 0),
  CHECK(kind = 'BUY' OR technical_cash_used = 0),
  CHECK(kind IN ('BUY','SELL') OR unit_price IS NULL),
  CHECK(kind IN ('BUY','SELL') OR fees = 0),
  CHECK(kind IN ('BUY','SELL','DIVIDEND') OR asset_id IS NULL),
  CHECK(fx_to_eur IS NULL OR fx_to_eur > 0)
);
CREATE UNIQUE INDEX transactions_import_unique ON transactions(import_batch_id,import_source_key)
  WHERE import_batch_id IS NOT NULL AND import_source_key IS NOT NULL;
CREATE INDEX transactions_by_asset_date ON transactions(portfolio_id,asset_id,occurred_at,sequence_number,id);
-- Journal de fonds interne. Les valeurs ont une devise, et les flux sont signés.
-- external_flow > 0 = argent nouvellement apporté ; < 0 = argent retiré.
-- Les dividendes distribués NE SONT PAS un retrait de capital externe :
-- distributed_income_eur est suivi séparément lors du calcul du TWR.
-- Toute ligne provient d'une transaction et est écrite atomiquement avec elle.
CREATE TABLE cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  transaction_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  kind cash_movement_kind NOT NULL,
  currency currency_code NOT NULL,
  technical_cash_delta numeric(28,12) NOT NULL DEFAULT 0,
  external_flow_amount numeric(28,12) NOT NULL DEFAULT 0,
  distributed_income_amount numeric(28,12) NOT NULL DEFAULT 0 CHECK(distributed_income_amount >= 0),
  fx_to_eur numeric(28,14) NOT NULL CHECK(fx_to_eur > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(transaction_id,portfolio_id) REFERENCES transactions(id,portfolio_id) ON DELETE CASCADE,
  CHECK(NOT (external_flow_amount <> 0 AND distributed_income_amount <> 0))
);
CREATE INDEX cash_movements_portfolio_time ON cash_movements(portfolio_id,occurred_at,id);
CREATE INDEX cash_movements_transaction ON cash_movements(transaction_id);
-- Côté service : vérifier appartenance au même portefeuille, solde technique
-- non négatif PAR DEVISE, et exactitude des flux par rapport au montant net.

CREATE TABLE market_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id),
  price numeric(28,12) NOT NULL CHECK(price > 0), currency currency_code NOT NULL,
  origin price_origin NOT NULL, observed_at timestamptz,
  observation_status observation_status NOT NULL DEFAULT 'OBSERVED',
  fetched_at timestamptz NOT NULL DEFAULT now(), is_stale boolean NOT NULL DEFAULT false,
  CHECK((observation_status = 'OBSERVED' AND observed_at IS NOT NULL)
     OR (observation_status = 'OBSERVATION_TIME_UNKNOWN' AND observed_at IS NULL)),
  UNIQUE(asset_id,origin,fetched_at)
);
CREATE INDEX market_prices_latest ON market_prices(asset_id,fetched_at DESC);
CREATE TABLE fx_rates (
  base_currency currency_code NOT NULL, quote_currency currency_code NOT NULL,
  rate numeric(28,14) NOT NULL CHECK(rate > 0), observed_at timestamptz NOT NULL,
  source text NOT NULL, PRIMARY KEY(base_currency,quote_currency,observed_at)
);
CREATE TABLE valuation_snapshots (
  portfolio_id uuid NOT NULL REFERENCES portfolios(id), day date NOT NULL,
  market_value_eur numeric(28,12) NOT NULL,
  technical_cash_eur numeric(28,12) NOT NULL DEFAULT 0,
  economic_value_eur numeric(28,12) NOT NULL,
  -- Apports/retraits EXTERNES hors distributions de revenus :
  external_flow_eur numeric(28,12) NOT NULL DEFAULT 0,
  distributed_income_eur numeric(28,12) NOT NULL DEFAULT 0,
  earned_dividends_eur numeric(28,12) NOT NULL DEFAULT 0,
  CHECK (economic_value_eur = market_value_eur + technical_cash_eur),
  performance_index numeric(28,14), calculation_method text NOT NULL,
  calculation_version integer NOT NULL,
  status snapshot_status NOT NULL DEFAULT 'READY', status_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(portfolio_id,day)
);
CREATE TABLE sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, provider text NOT NULL,
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  imported_count integer NOT NULL DEFAULT 0, error_message text
);
CREATE TABLE app_preferences (
  user_id uuid PRIMARY KEY REFERENCES app_users(id), positions_view text NOT NULL DEFAULT 'table'
    CHECK(positions_view IN ('table','cards')),
  dashboard_period text NOT NULL DEFAULT '1Y', updated_at timestamptz NOT NULL DEFAULT now()
);

-- Valorisation datée d'un contrat en fonds euros : aucune part fictive n'est créée.
CREATE TABLE life_insurance_valuations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  effective_at timestamptz NOT NULL,
  value numeric(28,12) NOT NULL CHECK(value >= 0),
  currency currency_code NOT NULL,
  fx_to_eur numeric(28,14) NOT NULL CHECK(fx_to_eur > 0),
  origin price_origin NOT NULL CHECK(origin IN ('MANUAL','IMPORT')),
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id,effective_at)
);

-- Audit avant correction. old_data contient la ligne antérieure complète.
CREATE TABLE transaction_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK(revision_number > 0),
  old_data jsonb NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES app_users(id),
  UNIQUE(transaction_id,revision_number)
);

-- Toute correction rétroactive invalide les projections à compter de cette date.
CREATE TABLE calculation_invalidations (
  portfolio_id uuid PRIMARY KEY REFERENCES portfolios(id),
  invalid_from timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- IMPORTANT: contraintes métier supplémentaires en service transactionnel : empêcher ventes > position détenue;
-- associer les dividendes aux positions existantes si requis; calculer PRU chronologiquement;
-- interdire catégories différentes lors des écritures; idempotence d'import inter-batch via checksum et validation.

-- NOTE MÉTIER V1.2 :
-- BUY: apport externe par défaut. Si depuis réserve interne, débit cash technique ;
-- MIXED = débit réserve + apport externe du complément. Aucun cash négatif.
-- SELL: destination EXTERNAL par défaut (sortie du produit net). TECHNICAL_CASH:
-- crédit cash interne, aucun flux externe ; gain réalisé calculé séparément.
-- DIVIDEND: net effectivement encaissé. Destination EXTERNAL: distribution de revenu
-- à neutraliser pour le TWR, sans double comptage comme retrait de capital.
-- Destination TECHNICAL_CASH: crédite la réserve, revenu inclus une seule fois.
-- LIFE_INSURANCE: valeur de fonds euros via valuation manuelle datée, produits
-- capitalisés ; ne pas fabriquer des positions d'actions ou dividendes.
-- Calcul de TWR par périodes en chaîne : ne déclarer EXACT que si la valorisation
-- aux instants des flux est réellement disponible. Sinon status='ESTIMATED'.
-- Le moteur TypeScript doit imposer cohérence cross-table, ordre chronologique,
-- fraîcheur FX et recalculs après corrections rétroactives.
