import { Pool } from "pg";

process.loadEnvFile(".env.local");

const definitions = [
  ["Actions", "EQUITY"],
  ["ETF", "ETF"],
  ["BTC", "CRYPTO"],
  ["ETH", "CRYPTO"],
  ["SCPI", "SCPI"],
  ["Assurance-vie Inès", "LIFE_INSURANCE"],
  ["Assurance-vie Cyril", "LIFE_INSURANCE"],
  ["Milàn — ETF", "ETF"],
  ["Milàn — Actions", "EQUITY"],
  ["Milàn — BTC", "CRYPTO"],
  ["Milàn — ETH", "CRYPTO"],
  ["Milàn — Fonds euros", "LIFE_INSURANCE"],
] as const;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL est obligatoire.");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query<{ id: string }>("SELECT id FROM app_users ORDER BY created_at");
    if (users.rowCount !== 1 || !users.rows[0]) throw new Error("Le compte utilisateur unique doit exister.");
    for (const [name, category] of definitions) {
      await client.query(
        `INSERT INTO portfolios(user_id,name,category,opened_on)
         VALUES($1,$2,$3,DATE '2023-05-01')
         ON CONFLICT(user_id,name) DO NOTHING`,
        [users.rows[0].id, name, category],
      );
    }
    const stored = await client.query<{ name: string; category: string }>(
      "SELECT name,category::text FROM portfolios WHERE user_id=$1", [users.rows[0].id],
    );
    for (const [name, category] of definitions) {
      const portfolio = stored.rows.find((row) => row.name === name);
      if (!portfolio || portfolio.category !== category) throw new Error(`Portefeuille incohérent : ${name}`);
    }
    await client.query("COMMIT");
    process.stdout.write(`${definitions.length} portefeuilles initialisés ou vérifiés.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Initialisation impossible : ${error instanceof Error ? error.message : "Erreur inconnue"}\n`);
  process.exitCode = 1;
});
