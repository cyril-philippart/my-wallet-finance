import "server-only";
import { Pool, type QueryResultRow } from "pg";

const globalDatabase = globalThis as typeof globalThis & { databasePool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL est obligatoire.");
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
}

export const database = globalDatabase.databasePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalDatabase.databasePool = database;

export async function queryOne<T extends QueryResultRow>(text: string, values: unknown[]): Promise<T | null> {
  const result = await database.query<T>(text, values);
  return result.rows[0] ?? null;
}
