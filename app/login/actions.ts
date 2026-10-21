"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { verifyPassword } from "../../src/auth/password.js";
import { createSessionToken } from "../../src/auth/session-token.js";
import { createDatabaseSession, setSessionCookie } from "../../src/server/auth.js";
import { database, queryOne } from "../../src/server/database.js";

export interface LoginState { error?: string }

const schema = z.object({
  password: z.string().min(1).max(512),
});

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: "Identifiant ou mot de passe incorrect." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  const ipHash = createHmac("sha256", secret).update(ip).digest("hex");
  const recentFailures = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM auth_login_attempts
      WHERE login=$1 AND ip_hash=$2 AND succeeded=false AND attempted_at > now() - interval '15 minutes'`,
    ["Cyril", ipHash],
  );
  if (Number(recentFailures?.count ?? 0) >= 5) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  }

  const user = await queryOne<{ id: string; password_hash: string }>(
    `SELECT id,password_hash FROM app_users ORDER BY created_at LIMIT 1`, [],
  );
  const valid = user ? await verifyPassword(user.password_hash, parsed.data.password) : false;
  await database.query(
    `INSERT INTO auth_login_attempts(login,ip_hash,succeeded) VALUES($1,$2,$3)`,
    ["Cyril", ipHash, valid],
  );
  if (!user || !valid) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  const token = createSessionToken();
  const expiresAt = await createDatabaseSession(user.id, token);
  await setSessionCookie(token, expiresAt);
  redirect("/");
}
