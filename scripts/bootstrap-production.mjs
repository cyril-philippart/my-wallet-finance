import { hash } from "@node-rs/argon2";
import pg from "pg";

const { Pool } = pg;
const login = process.env.ADMIN_LOGIN || "Cyril";
const password = process.env.ADMIN_PASSWORD;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL est obligatoire.");
if (!password) throw new Error("ADMIN_PASSWORD est obligatoire pour initialiser la production.");

const portfolios = [
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
];

const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  let users = await client.query("SELECT id, login FROM app_users ORDER BY created_at");

  if (users.rowCount === 0) {
    const passwordHash = await hash(password);
    users = await client.query(
      "INSERT INTO app_users(login,password_hash) VALUES($1,$2) RETURNING id,login",
      [login, passwordHash],
    );
    process.stdout.write(`Compte ${login} créé.\n`);
  }

  if (users.rowCount !== 1 || !users.rows[0]) {
    throw new Error("La production doit contenir exactement un compte utilisateur.");
  }

  const userId = users.rows[0].id;
  for (const [name, category] of portfolios) {
    await client.query(
      `INSERT INTO portfolios(user_id,name,category,opened_on)
       VALUES($1,$2,$3,DATE '2023-05-01')
       ON CONFLICT(user_id,name) DO NOTHING`,
      [userId, name, category],
    );
  }

  await client.query("COMMIT");
  process.stdout.write(`Initialisation vérifiée pour ${users.rows[0].login}.\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
