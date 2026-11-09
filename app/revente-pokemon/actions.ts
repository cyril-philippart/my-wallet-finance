"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "../../src/server/auth.js";
import { database } from "../../src/server/database.js";
import { ensurePokemonTradingTables } from "../../src/server/pokemon-resale-queries.js";

export type TradingActionState = { ok?: boolean; message?: string };
const numberFromInput = (positive = false) =>
  z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.trim().replace(/\s/g, "").replace(",", ".")
        : value,
    positive ? z.coerce.number().positive() : z.coerce.number().min(0),
  );
const purchaseSchema = z.object({
  purchasedOn: z.iso.date(),
  seriesName: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(180),
  quantity: numberFromInput(true),
  unitCost: numberFromInput(),
});
const editPurchaseSchema = purchaseSchema.extend({ id: z.string().uuid() });
const saleSchema = z.object({
  soldOn: z.iso.date(),
  description: z.string().trim().min(1).max(180),
  saleChannel: z.enum(["VINTED", "PHYSICAL"]),
  saleTotal: numberFromInput(),
  items: z
    .array(
      z.object({
        seriesName: z.string().trim().min(1),
        productName: z.string().trim().min(1),
        quantity: numberFromInput(true),
      }),
    )
    .min(1),
});
const editSaleSchema = saleSchema.extend({ id: z.string().uuid() });
const refresh = () => {
  revalidatePath("/revente-pokemon");
  revalidatePath("/historique");
};
const productKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
const cleanProductName = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ");

export async function addPokemonPurchaseAction(
  _: TradingActionState,
  formData: FormData,
): Promise<TradingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Session expirée." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("purchases") ?? "[]"));
  } catch {
    return { message: "Les produits saisis sont invalides." };
  }
  const parsed = z.array(purchaseSchema).min(1).safeParse(raw);
  if (!parsed.success) return { message: "Vérifie les lignes saisies." };
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existingNames = await client.query<{
      series_name: string;
      product_name: string;
    }>(
      `SELECT DISTINCT series_name,product_name FROM pokemon_inventory_purchases WHERE user_id=$1 ORDER BY series_name,product_name`,
      [user.id],
    );
    const canonicalNames = new Map(
      existingNames.rows.map((row) => [
        `${productKey(row.series_name)}\u0000${productKey(row.product_name)}`,
        row.product_name,
      ]),
    );
    const canonicalSeries = new Map(
      existingNames.rows.map((row) => [
        productKey(row.series_name),
        row.series_name,
      ]),
    );
    for (const row of parsed.data) {
      const cleanedSeries = cleanProductName(row.seriesName),
        seriesName =
          canonicalSeries.get(productKey(cleanedSeries)) ?? cleanedSeries;
      canonicalSeries.set(productKey(seriesName), seriesName);
      const cleanedName = cleanProductName(row.productName),
        key = `${productKey(seriesName)}\u0000${productKey(cleanedName)}`,
        productName = canonicalNames.get(key) ?? cleanedName;
      canonicalNames.set(key, productName);
      const amount = new Decimal(row.quantity).mul(row.unitCost).toString();
      await client.query(
        `INSERT INTO pokemon_inventory_purchases(user_id,purchased_on,series_name,product_name,quantity,unit_cost_eur) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          user.id,
          row.purchasedOn,
          seriesName,
          productName,
          row.quantity,
          row.unitCost,
        ],
      );
      await client.query(
        `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,quantity,unit_price_eur,amount_eur) VALUES($1,'BUY',$2,$3,$4,$5,$6)`,
        [
          user.id,
          row.purchasedOn,
          productName,
          row.quantity,
          row.unitCost,
          amount,
        ],
      );
    }
    await client.query("COMMIT");
    refresh();
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Enregistrement achats Pokémon impossible", error);
    return {
      message:
        error instanceof Error
          ? `Les achats n’ont pas pu être enregistrés : ${error.message}`
          : "Les achats n’ont pas pu être enregistrés.",
    };
  } finally {
    client.release();
  }
}

export async function addPokemonSaleAction(
  _: TradingActionState,
  formData: FormData,
): Promise<TradingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Session expirée." };
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { message: "Composition du lot invalide." };
  }
  const parsed = saleSchema.safeParse({
    ...Object.fromEntries(formData),
    items: rawItems,
  });
  if (!parsed.success)
    return { message: "Vérifie la vente et sa composition." };
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const sale = await client.query<{ id: string }>(
      `INSERT INTO pokemon_resale_sales(user_id,sold_on,description,sale_channel,sale_total_eur) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [
        user.id,
        parsed.data.soldOn,
        parsed.data.description,
        parsed.data.saleChannel,
        parsed.data.saleTotal,
      ],
    );
    const requested = new Map<string, Decimal>();
    for (const item of parsed.data.items) {
      const key = `${productKey(item.seriesName)}\u0000${productKey(item.productName)}`;
      requested.set(
        key,
        (requested.get(key) ?? new Decimal(0)).add(item.quantity),
      );
    }
    for (const [key, initialNeeded] of requested) {
      let needed = initialNeeded;
      const [seriesKey, productNameKey] = key.split("\u0000");
      const lots = await client.query<{
        id: string;
        unit_cost_eur: string;
        available: string;
      }>(
        `SELECT p.id,p.unit_cost_eur::text,(p.quantity-coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0))::text available FROM pokemon_inventory_purchases p WHERE p.user_id=$1 AND lower(trim(p.series_name))=$2 AND lower(trim(p.product_name))=$3 AND p.quantity-coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0)>0 ORDER BY p.purchased_on,p.created_at,p.id FOR UPDATE`,
        [user.id, seriesKey, productNameKey],
      );
      for (const lot of lots.rows) {
        if (needed.lte(0)) break;
        const take = Decimal.min(needed, lot.available);
        await client.query(
          `INSERT INTO pokemon_resale_sale_items(sale_id,purchase_id,quantity,unit_cost_eur) VALUES($1,$2,$3,$4)`,
          [sale.rows[0]!.id, lot.id, take.toString(), lot.unit_cost_eur],
        );
        needed = needed.minus(take);
      }
      if (needed.gt(0)) throw new Error("INSUFFICIENT_STOCK");
    }
    const totalQuantity = parsed.data.items
      .reduce((sum, item) => sum.add(item.quantity), new Decimal(0))
      .toString();
    await client.query(
      `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,quantity,amount_eur,reason) VALUES($1,'SELL',$2,$3,$4,$5,$6)`,
      [
        user.id,
        parsed.data.soldOn,
        parsed.data.description,
        totalQuantity,
        parsed.data.saleTotal,
        parsed.data.items
          .map((item) => `${item.quantity} × ${item.productName}`)
          .join(" ; "),
      ],
    );
    await client.query("COMMIT");
    refresh();
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Enregistrement vente Pokémon impossible", error);
    return {
      message:
        error instanceof Error && error.message === "INSUFFICIENT_STOCK"
          ? "Stock insuffisant pour cette vente."
          : "La vente n’a pas pu être enregistrée.",
    };
  } finally {
    client.release();
  }
}

export async function updatePokemonSaleAction(
  _: TradingActionState,
  formData: FormData,
): Promise<TradingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Session expirée." };
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { message: "Composition du lot invalide." };
  }
  const parsed = editSaleSchema.safeParse({
    ...Object.fromEntries(formData),
    items: rawItems,
  });
  if (!parsed.success)
    return { message: "Vérifie la vente et sa composition." };
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id FROM pokemon_resale_sales WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [parsed.data.id, user.id],
    );
    if (!found.rows[0]) throw new Error("NOT_FOUND");
    await client.query(
      `DELETE FROM pokemon_resale_sale_items WHERE sale_id=$1`,
      [parsed.data.id],
    );
    const requested = new Map<string, Decimal>();
    for (const item of parsed.data.items) {
      const key = `${productKey(item.seriesName)}\u0000${productKey(item.productName)}`;
      requested.set(
        key,
        (requested.get(key) ?? new Decimal(0)).add(item.quantity),
      );
    }
    for (const [key, initialNeeded] of requested) {
      let needed = initialNeeded;
      const [seriesKey, productNameKey] = key.split("\u0000");
      const lots = await client.query<{
        id: string;
        unit_cost_eur: string;
        available: string;
      }>(
        `SELECT p.id,p.unit_cost_eur::text,(p.quantity-coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0))::text available FROM pokemon_inventory_purchases p WHERE p.user_id=$1 AND lower(trim(p.series_name))=$2 AND lower(trim(p.product_name))=$3 AND p.quantity-coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0)>0 ORDER BY p.purchased_on,p.created_at,p.id FOR UPDATE`,
        [user.id, seriesKey, productNameKey],
      );
      for (const lot of lots.rows) {
        if (needed.lte(0)) break;
        const take = Decimal.min(needed, lot.available);
        await client.query(
          `INSERT INTO pokemon_resale_sale_items(sale_id,purchase_id,quantity,unit_cost_eur) VALUES($1,$2,$3,$4)`,
          [parsed.data.id, lot.id, take.toString(), lot.unit_cost_eur],
        );
        needed = needed.minus(take);
      }
      if (needed.gt(0)) throw new Error("INSUFFICIENT_STOCK");
    }
    await client.query(
      `UPDATE pokemon_resale_sales SET sold_on=$1,description=$2,sale_channel=$3,sale_total_eur=$4 WHERE id=$5 AND user_id=$6`,
      [
        parsed.data.soldOn,
        parsed.data.description,
        parsed.data.saleChannel,
        parsed.data.saleTotal,
        parsed.data.id,
        user.id,
      ],
    );
    const totalQuantity = parsed.data.items
      .reduce((sum, item) => sum.add(item.quantity), new Decimal(0))
      .toString();
    await client.query(
      `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,quantity,amount_eur,reason) VALUES($1,'MODIFIED',$2,$3,$4,$5,$6)`,
      [
        user.id,
        parsed.data.soldOn,
        parsed.data.description,
        totalQuantity,
        parsed.data.saleTotal,
        "Vente modifiée",
      ],
    );
    await client.query("COMMIT");
    refresh();
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Modification vente Pokémon impossible", error);
    return {
      message:
        error instanceof Error && error.message === "INSUFFICIENT_STOCK"
          ? "Stock insuffisant pour cette vente."
          : "La modification de la vente a échoué.",
    };
  } finally {
    client.release();
  }
}

export async function updatePokemonPurchaseAction(
  _: TradingActionState,
  formData: FormData,
): Promise<TradingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Session expirée." };
  const parsed = editPurchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Vérifie les données saisies." };
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ sold: string }>(
      `SELECT coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0)::text sold FROM pokemon_inventory_purchases p WHERE p.id=$1 AND p.user_id=$2 FOR UPDATE`,
      [parsed.data.id, user.id],
    );
    if (!found.rows[0]) throw new Error("NOT_FOUND");
    if (new Decimal(parsed.data.quantity).lt(found.rows[0].sold))
      throw new Error("BELOW_SOLD");
    const amount = new Decimal(parsed.data.quantity)
      .mul(parsed.data.unitCost)
      .toString();
    await client.query(
      `UPDATE pokemon_inventory_purchases SET purchased_on=$1,series_name=$2,product_name=$3,quantity=$4,unit_cost_eur=$5 WHERE id=$6 AND user_id=$7`,
      [
        parsed.data.purchasedOn,
        parsed.data.seriesName,
        parsed.data.productName,
        parsed.data.quantity,
        parsed.data.unitCost,
        parsed.data.id,
        user.id,
      ],
    );
    await client.query(
      `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,quantity,unit_price_eur,amount_eur,reason) VALUES($1,'MODIFIED',$2,$3,$4,$5,$6,'Achat modifié')`,
      [
        user.id,
        parsed.data.purchasedOn,
        parsed.data.productName,
        parsed.data.quantity,
        parsed.data.unitCost,
        amount,
      ],
    );
    await client.query("COMMIT");
    refresh();
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Modification achat Pokémon impossible", error);
    return {
      message:
        error instanceof Error && error.message === "BELOW_SOLD"
          ? "La quantité ne peut pas être inférieure à la quantité déjà vendue."
          : "La modification a échoué.",
    };
  } finally {
    client.release();
  }
}

export async function deletePokemonPurchaseAction(
  id: string,
): Promise<TradingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Session expirée." };
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      purchased_on: string;
      product_name: string;
      quantity: string;
      unit_cost_eur: string;
      sold: string;
    }>(
      `SELECT p.purchased_on::text,p.product_name,p.quantity::text,p.unit_cost_eur::text,coalesce((SELECT sum(i.quantity) FROM pokemon_resale_sale_items i WHERE i.purchase_id=p.id),0)::text sold FROM pokemon_inventory_purchases p WHERE p.id=$1 AND p.user_id=$2 FOR UPDATE`,
      [id, user.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("NOT_FOUND");
    if (new Decimal(row.sold).gt(0)) throw new Error("ALREADY_SOLD");
    const amount = new Decimal(row.quantity).mul(row.unit_cost_eur).toString();
    await client.query(
      `DELETE FROM pokemon_inventory_purchases WHERE id=$1 AND user_id=$2`,
      [id, user.id],
    );
    await client.query(
      `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,quantity,unit_price_eur,amount_eur,reason) VALUES($1,'DELETED',$2,$3,$4,$5,$6,'Achat supprimé')`,
      [
        user.id,
        row.purchased_on,
        row.product_name,
        row.quantity,
        row.unit_cost_eur,
        amount,
      ],
    );
    await client.query("COMMIT");
    refresh();
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Suppression achat Pokémon impossible", error);
    return {
      message:
        error instanceof Error && error.message === "ALREADY_SOLD"
          ? "Impossible de supprimer cet achat : une partie a déjà été vendue."
          : error instanceof Error
            ? `La suppression a échoué : ${error.message}`
            : "La suppression a échoué.",
    };
  } finally {
    client.release();
  }
}

export async function deletePokemonSaleAction(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await ensurePokemonTradingTables();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const sale = await client.query<{
      sold_on: string;
      description: string;
      sale_total_eur: string;
    }>(
      `DELETE FROM pokemon_resale_sales WHERE id=$1 AND user_id=$2 RETURNING sold_on::text,description,sale_total_eur::text`,
      [id, user.id],
    );
    if (sale.rows[0])
      await client.query(
        `INSERT INTO pokemon_trading_events(user_id,action,occurred_on,product_name,amount_eur,reason) VALUES($1,'DELETED',$2,$3,$4,'Vente supprimée')`,
        [
          user.id,
          sale.rows[0].sold_on,
          sale.rows[0].description,
          sale.rows[0].sale_total_eur,
        ],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Suppression vente Pokémon impossible", error);
    throw error;
  } finally {
    client.release();
  }
  refresh();
}
