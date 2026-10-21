import "server-only";
import Decimal from "decimal.js";
import type { PoolClient } from "pg";
import { database } from "./database.js";
import {normalizeTicker} from "../domain/tickers.js";

export type TransactionInput = {
  userId: string;
  portfolioId: string;
  kind: "BUY" | "SELL" | "DIVIDEND";
  assetName: string;
  symbol: string;
  googleTicker?: string | undefined;
  occurredAt: string;
  currency: string;
  quantity?: string | undefined;
  unitPrice?: string | undefined;
  fees: string;
  netAmount?: string | undefined;
  fxToEur: string;
};

async function findOrCreateAsset(client: PoolClient, input: TransactionInput, category: string): Promise<string> {
  const normalizedTicker=normalizeTicker(input.googleTicker??"");
  const found = await client.query<{ id: string }>(
    `SELECT id FROM assets
       WHERE category=$1
         AND (upper(external_symbol)=upper($2)
           OR (nullif($3,'') IS NOT NULL AND upper(google_ticker)=upper($3))
           OR (nullif($3,'') IS NULL AND lower(name)=lower($4)))
       ORDER BY CASE WHEN lower(name)=lower($4) THEN 0 ELSE 1 END LIMIT 1`,
    [category, input.symbol, normalizedTicker,input.assetName],
  );
  if (found.rows[0]) {
    const googleTicker=normalizedTicker;
    if(googleTicker){
      await client.query(
        `UPDATE assets SET google_ticker=upper($2),pricing_method='GOOGLEFINANCE'
           WHERE id=$1 AND (google_ticker IS NULL OR google_ticker='' OR upper(google_ticker)=upper($2))`,
        [found.rows[0].id,googleTicker],
      );
    }
    return found.rows[0].id;
  }
  if (input.kind === "SELL") throw new Error("ASSET_NOT_FOUND");
  const created = await client.query<{ id: string }>(
    `INSERT INTO assets(category,name,external_symbol,quote_currency,google_ticker,pricing_method)
     VALUES($1,$2,upper($3),$4,
       coalesce(nullif(upper($5),''),CASE WHEN upper($3)='BTC' THEN 'BTCEUR' WHEN upper($3)='ETH' THEN 'ETHEUR' ELSE NULL END),
       CASE WHEN nullif($5,'') IS NOT NULL OR upper($3) IN('BTC','ETH') THEN 'GOOGLEFINANCE' ELSE 'MANUAL' END) RETURNING id`,
    [category, input.assetName, input.symbol, input.currency,normalizedTicker],
  );
  if (!created.rows[0]) throw new Error("ASSET_CREATION_FAILED");
  return created.rows[0].id;
}

export async function recordTransactionWithClient(client:PoolClient,input:TransactionInput):Promise<string>{
    const portfolioResult = await client.query<{ category: string }>(
      `SELECT category::text FROM portfolios WHERE id=$1 AND user_id=$2 AND archived_at IS NULL FOR UPDATE`,
      [input.portfolioId, input.userId],
    );
    const portfolio = portfolioResult.rows[0];
    if (!portfolio) throw new Error("PORTFOLIO_NOT_FOUND");
    if (portfolio.category === "LIFE_INSURANCE") throw new Error("LIFE_INSURANCE_REQUIRES_SPECIFIC_OPERATION");

    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [input.portfolioId]);
    const assetId = await findOrCreateAsset(client, input, portfolio.category);
    if (input.kind === "SELL") {
      const linked = await client.query(
        `SELECT 1 FROM portfolio_assets WHERE portfolio_id=$1 AND asset_id=$2`,
        [input.portfolioId, assetId],
      );
      if (linked.rowCount !== 1) throw new Error("ASSET_NOT_FOUND");
    }
    await client.query(
      `INSERT INTO portfolio_assets(portfolio_id,asset_id,category) VALUES($1,$2,$3)
       ON CONFLICT(portfolio_id,asset_id) DO NOTHING`,
      [input.portfolioId, assetId, portfolio.category],
    );

    const sequenceResult = await client.query<{ next: string }>(
      `SELECT (coalesce(max(sequence_number),0)+1)::text AS next FROM transactions WHERE portfolio_id=$1`,
      [input.portfolioId],
    );
    const sequence = sequenceResult.rows[0]?.next ?? "1";
    const fees = new Decimal(input.fees);
    const fx = new Decimal(input.fxToEur);
    let quantity: string | null = null;
    let unitPrice: string | null = null;
    let gross: Decimal;
    let net: Decimal;
    let saleDestination: "EXTERNAL" | null = null;
    let dividendDestination: "EXTERNAL" | null = null;
    let buySource: "EXTERNAL" | null = null;

    if (input.kind === "DIVIDEND") {
      net = new Decimal(input.netAmount ?? 0);
      gross = net;
      dividendDestination = "EXTERNAL";
    } else {
      quantity = input.quantity ?? null;
      unitPrice = input.unitPrice ?? null;
      if (!quantity || !unitPrice) throw new Error("TRADE_VALUES_MISSING");
      gross = new Decimal(quantity).mul(unitPrice);
      net = input.kind === "BUY" ? gross.add(fees) : gross.sub(fees);
      if (input.kind === "SELL") {
        const held = await client.query<{ quantity: string }>(
          `SELECT coalesce(sum(CASE WHEN kind='BUY' THEN quantity WHEN kind='SELL' THEN -quantity ELSE 0 END),0)::text AS quantity
             FROM transactions WHERE portfolio_id=$1 AND asset_id=$2 AND occurred_at <= $3`,
          [input.portfolioId, assetId, input.occurredAt],
        );
        if (new Decimal(held.rows[0]?.quantity ?? 0).lt(quantity)) throw new Error("INSUFFICIENT_QUANTITY");
        saleDestination = "EXTERNAL";
      } else buySource = "EXTERNAL";
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO transactions(portfolio_id,asset_id,kind,occurred_at,sequence_number,quantity,unit_price,fees,gross_amount,net_amount,currency,fx_to_eur,sale_destination,dividend_destination,buy_source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [input.portfolioId, assetId, input.kind, input.occurredAt, sequence, quantity, unitPrice, fees.toString(), gross.toString(), net.toString(), input.currency, fx.toString(), saleDestination, dividendDestination, buySource],
    );
    const transactionId = inserted.rows[0]?.id;
    if (!transactionId) throw new Error("TRANSACTION_CREATION_FAILED");

    const externalFlow = input.kind === "BUY" ? net : input.kind === "SELL" ? net.negated() : new Decimal(0);
    const distributedIncome = input.kind === "DIVIDEND" ? net : new Decimal(0);
    const movementKind = input.kind === "BUY" ? "BUY_FUNDING" : input.kind === "SELL" ? "SALE_PROCEEDS" : "DIVIDEND";
    await client.query(
      `INSERT INTO cash_movements(portfolio_id,transaction_id,occurred_at,kind,currency,external_flow_amount,distributed_income_amount,fx_to_eur)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.portfolioId, transactionId, input.occurredAt, movementKind, input.currency, externalFlow.toString(), distributedIncome.toString(), fx.toString()],
    );
    // Une opération antidatée modifie les positions de toutes les journées
    // suivantes : leurs valorisations doivent être reconstruites au prochain sync.
    await client.query(
      `UPDATE valuation_snapshots
          SET status='INVALIDATED',
              status_reasons='["BACKDATED_TRANSACTION"]'::jsonb,
              computed_at=now()
        WHERE portfolio_id=$1 AND day >= $2::date`,
      [input.portfolioId,input.occurredAt],
    );
    return transactionId;
}

export async function recordTransaction(input: TransactionInput): Promise<string> {
  const client=await database.connect();
  try{await client.query("BEGIN");const id=await recordTransactionWithClient(client,input);await client.query("COMMIT");return id;}
  catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
}
