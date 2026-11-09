import "server-only";
import Decimal from "decimal.js";
import { database } from "./database.js";

export interface PokemonStockLot {
  id: string;
  purchasedOn: string;
  seriesName: string;
  quantity: string;
  unitCostEur: string;
  soldQuantity: string;
  remainingQuantity: string;
  remainingValueEur: string;
}
export interface PokemonStockLine {
  id: string;
  purchasedOn: string;
  seriesName: string;
  productName: string;
  quantity: string;
  unitCostEur: string;
  soldQuantity: string;
  remainingQuantity: string;
  remainingValueEur: string;
  lots: PokemonStockLot[];
}
export interface PokemonStockProduct {
  seriesName: string;
  productName: string;
  remainingQuantity: string;
  averageCostEur: string;
}
export interface PokemonSaleLine {
  seriesName: string;
  productName: string;
  quantity: string;
  costEur: string;
}
export type PokemonSaleChannel = "VINTED" | "PHYSICAL";
export interface PokemonSale {
  id: string;
  soldOn: string;
  description: string;
  saleChannel: PokemonSaleChannel;
  saleTotalEur: string;
  costTotalEur: string;
  profitEur: string;
  items: PokemonSaleLine[];
}
export interface PokemonTradingData {
  purchases: PokemonStockLine[];
  products: PokemonStockProduct[];
  sales: PokemonSale[];
  purchasedTotalEur: string;
  stockValueEur: string;
  revenueEur: string;
  profitEur: string;
}
const norm = (value: string) => value.trim().toLocaleLowerCase("fr");
const stockKey = (series: string, product: string) =>
  `${norm(series)}\u0000${norm(product)}`;

export async function ensurePokemonTradingTables() {
  await database.query(`
CREATE TABLE IF NOT EXISTS pokemon_inventory_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,purchased_on date NOT NULL,series_name varchar(120) NOT NULL DEFAULT 'Non classée',product_name varchar(180) NOT NULL,quantity numeric(18,6) NOT NULL CHECK(quantity>0),unit_cost_eur numeric(18,6) NOT NULL CHECK(unit_cost_eur>=0),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE pokemon_inventory_purchases ADD COLUMN IF NOT EXISTS series_name varchar(120) NOT NULL DEFAULT 'Non classée';
CREATE TABLE IF NOT EXISTS pokemon_resale_sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,sold_on date NOT NULL,description text NOT NULL,sale_channel varchar(16) NOT NULL DEFAULT 'VINTED' CHECK(sale_channel IN ('VINTED','PHYSICAL')),sale_total_eur numeric(18,6) NOT NULL CHECK(sale_total_eur>=0),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE pokemon_resale_sales ADD COLUMN IF NOT EXISTS sale_channel varchar(16) NOT NULL DEFAULT 'VINTED';
CREATE TABLE IF NOT EXISTS pokemon_resale_sale_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid NOT NULL REFERENCES pokemon_resale_sales(id) ON DELETE CASCADE,purchase_id uuid NOT NULL REFERENCES pokemon_inventory_purchases(id) ON DELETE RESTRICT,quantity numeric(18,6) NOT NULL CHECK(quantity>0),unit_cost_eur numeric(18,6) NOT NULL CHECK(unit_cost_eur>=0));
CREATE TABLE IF NOT EXISTS pokemon_trading_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,action varchar(16) NOT NULL CHECK(action IN ('BUY','SELL','MODIFIED','DELETED')),occurred_on date NOT NULL,product_name varchar(180) NOT NULL,quantity numeric(18,6),unit_price_eur numeric(18,6),amount_eur numeric(18,6),reason text,created_at timestamptz NOT NULL DEFAULT now());`);
}

export async function getPokemonTradingData(
  userId: string,
): Promise<PokemonTradingData> {
  await ensurePokemonTradingTables();
  const [purchaseResult, saleResult, itemResult] = await Promise.all([
    database.query<{
      id: string;
      purchased_on: string;
      series_name: string;
      product_name: string;
      quantity: string;
      unit_cost_eur: string;
      sold_quantity: string;
    }>(
      `SELECT p.id,p.purchased_on::text,p.series_name,p.product_name,p.quantity::text,p.unit_cost_eur::text,coalesce(sum(i.quantity),0)::text sold_quantity FROM pokemon_inventory_purchases p LEFT JOIN pokemon_resale_sale_items i ON i.purchase_id=p.id WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.purchased_on ASC,p.created_at ASC`,
      [userId],
    ),
    database.query<{
      id: string;
      sold_on: string;
      description: string;
      sale_channel: PokemonSaleChannel;
      sale_total_eur: string;
    }>(
      `SELECT id,sold_on::text,description,sale_channel,sale_total_eur::text FROM pokemon_resale_sales WHERE user_id=$1 ORDER BY sold_on DESC,created_at DESC`,
      [userId],
    ),
    database.query<{
      sale_id: string;
      series_name: string;
      product_name: string;
      quantity: string;
      cost_eur: string;
    }>(
      `SELECT i.sale_id,p.series_name,p.product_name,sum(i.quantity)::text quantity,sum(i.quantity*i.unit_cost_eur)::text cost_eur FROM pokemon_resale_sale_items i JOIN pokemon_inventory_purchases p ON p.id=i.purchase_id JOIN pokemon_resale_sales s ON s.id=i.sale_id WHERE s.user_id=$1 GROUP BY i.sale_id,p.series_name,p.product_name ORDER BY p.series_name,p.product_name`,
      [userId],
    ),
  ]);
  let purchased = new Decimal(0),
    stockValue = new Decimal(0),
    revenue = new Decimal(0),
    profit = new Decimal(0);
  const lots = purchaseResult.rows.map((row) => {
    const remaining = new Decimal(row.quantity).minus(row.sold_quantity),
      value = remaining.mul(row.unit_cost_eur);
    purchased = purchased.add(new Decimal(row.quantity).mul(row.unit_cost_eur));
    stockValue = stockValue.add(value);
    return {
      id: row.id,
      purchasedOn: row.purchased_on,
      seriesName: row.series_name,
      productName: row.product_name,
      quantity: row.quantity,
      unitCostEur: row.unit_cost_eur,
      soldQuantity: row.sold_quantity,
      remainingQuantity: remaining.toString(),
      remainingValueEur: value.toString(),
    };
  });
  const grouped = new Map<
    string,
    {
      id: string;
      purchasedOn: string;
      seriesName: string;
      productName: string;
      quantity: Decimal;
      value: Decimal;
      sold: Decimal;
      remaining: Decimal;
      remainingValue: Decimal;
    }
  >();
  for (const lot of lots) {
    const key = stockKey(lot.seriesName, lot.productName),
      row = grouped.get(key) ?? {
        id: lot.id,
        purchasedOn: lot.purchasedOn,
        seriesName: lot.seriesName,
        productName: lot.productName,
        quantity: new Decimal(0),
        value: new Decimal(0),
        sold: new Decimal(0),
        remaining: new Decimal(0),
        remainingValue: new Decimal(0),
      };
    row.purchasedOn =
      row.purchasedOn > lot.purchasedOn ? row.purchasedOn : lot.purchasedOn;
    row.quantity = row.quantity.add(lot.quantity);
    row.value = row.value.add(new Decimal(lot.quantity).mul(lot.unitCostEur));
    row.sold = row.sold.add(lot.soldQuantity);
    row.remaining = row.remaining.add(lot.remainingQuantity);
    row.remainingValue = row.remainingValue.add(lot.remainingValueEur);
    grouped.set(key, row);
  }
  const purchases = [...grouped.entries()]
    .map(([key, row]) => ({
      id: row.id,
      purchasedOn: row.purchasedOn,
      seriesName: row.seriesName,
      productName: row.productName,
      quantity: row.quantity.toString(),
      unitCostEur: row.quantity.isZero()
        ? "0"
        : row.value.div(row.quantity).toString(),
      soldQuantity: row.sold.toString(),
      remainingQuantity: row.remaining.toString(),
      remainingValueEur: row.remainingValue.toString(),
      lots: lots
        .filter((lot) => stockKey(lot.seriesName, lot.productName) === key)
        .map(({ productName: _, ...lot }) => lot),
    }))
    .sort(
      (a, b) =>
        a.seriesName.localeCompare(b.seriesName, "fr") ||
        a.productName.localeCompare(b.productName, "fr"),
    );
  const products = purchases
    .filter((row) => new Decimal(row.remainingQuantity).gt(0))
    .map((row) => ({
      seriesName: row.seriesName,
      productName: row.productName,
      remainingQuantity: row.remainingQuantity,
      averageCostEur: new Decimal(row.remainingValueEur)
        .div(row.remainingQuantity)
        .toString(),
    }));
  const sales = saleResult.rows.map((row) => {
    const items = itemResult.rows
      .filter((item) => item.sale_id === row.id)
      .map((item) => ({
        seriesName: item.series_name,
        productName: item.product_name,
        quantity: item.quantity,
        costEur: item.cost_eur,
      }));
    const cost = items.reduce(
        (sum, item) => sum.add(item.costEur),
        new Decimal(0),
      ),
      gain = new Decimal(row.sale_total_eur).minus(cost);
    revenue = revenue.add(row.sale_total_eur);
    profit = profit.add(gain);
    return {
      id: row.id,
      soldOn: row.sold_on,
      description: row.description,
      saleChannel: row.sale_channel,
      saleTotalEur: row.sale_total_eur,
      costTotalEur: cost.toString(),
      profitEur: gain.toString(),
      items,
    };
  });
  return {
    purchases,
    products,
    sales,
    purchasedTotalEur: purchased.toString(),
    stockValueEur: stockValue.toString(),
    revenueEur: revenue.toString(),
    profitEur: profit.toString(),
  };
}
