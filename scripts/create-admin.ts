import { Pool } from "pg";
import { hashPassword } from "../src/auth/password.js";

process.loadEnvFile(".env.local");

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const login = "Cyril";
  const password = process.env.ADMIN_PASSWORD;

  if (!connectionString) throw new Error("DATABASE_URL est obligatoire.");
  if (!password) throw new Error("ADMIN_PASSWORD ne peut pas être vide.");

  const pool = new Pool({ connectionString });
  try {
    const existing = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM app_users");
    if (existing.rows[0]?.count !== "0") throw new Error("Un utilisateur existe déjà. Création refusée.");
    const passwordHash = await hashPassword(password);
    await pool.query("INSERT INTO app_users(login,password_hash) VALUES($1,$2)", [login, passwordHash]);
    process.stdout.write(`Compte administrateur créé pour ${login}.\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  process.stderr.write(`Création impossible : ${message}\n`);
  process.exitCode = 1;
});
