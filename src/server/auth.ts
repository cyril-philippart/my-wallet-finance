import "server-only";
import { cookies } from "next/headers";
import { hashSessionToken } from "../auth/session-token.js";
import { queryOne, database } from "./database.js";

const COOKIE_NAME = "mwf_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export interface AuthenticatedUser { id: string; login: string }

export async function createDatabaseSession(userId: string, rawToken: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await database.query(
    `INSERT INTO app_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,
    [userId, hashSessionToken(rawToken), expiresAt],
  );
  return expiresAt;
}

export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const rawToken = (await cookies()).get(COOKIE_NAME)?.value;
  if (!rawToken) return null;
  return queryOne<AuthenticatedUser>(
    `SELECT u.id,u.login
       FROM app_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashSessionToken(rawToken)],
  );
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(COOKIE_NAME)?.value;
  if (rawToken) {
    await database.query(`UPDATE app_sessions SET revoked_at=now() WHERE token_hash=$1`, [hashSessionToken(rawToken)]);
  }
  cookieStore.delete(COOKIE_NAME);
}
