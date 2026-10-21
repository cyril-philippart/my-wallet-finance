UPDATE portfolios SET name='BTC' WHERE name='Coinbase' AND category='CRYPTO';
UPDATE portfolios SET name='ETH' WHERE name='Binance' AND category='CRYPTO';

INSERT INTO portfolios(user_id,name,category,base_currency,opened_on)
SELECT id,'Milàn — Actions','EQUITY','EUR',DATE '2023-05-01' FROM app_users
ON CONFLICT(user_id,name) DO NOTHING;

INSERT INTO portfolios(user_id,name,category,base_currency,opened_on)
SELECT id,'Milàn — BTC','CRYPTO','EUR',DATE '2023-05-01' FROM app_users
ON CONFLICT(user_id,name) DO NOTHING;

INSERT INTO portfolios(user_id,name,category,base_currency,opened_on)
SELECT id,'Milàn — ETH','CRYPTO','EUR',DATE '2023-05-01' FROM app_users
ON CONFLICT(user_id,name) DO NOTHING;
