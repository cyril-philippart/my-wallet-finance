import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { createSessionToken, equalTokenHashes, hashSessionToken } from "../src/auth/session-token.js";

describe("authentification privée", () => {
  it("hache et vérifie un mot de passe avec Argon2id", async () => {
    const digest = await hashPassword("un-mot-de-passe-long-et-unique");
    expect(digest).toContain("$argon2id$");
    expect(await verifyPassword(digest, "un-mot-de-passe-long-et-unique")).toBe(true);
    expect(await verifyPassword(digest, "incorrect")).toBe(false);
  });

  it("ne conserve qu'une empreinte irréversible du jeton de session", () => {
    const token = createSessionToken();
    const digest = hashSessionToken(token);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(equalTokenHashes(digest, hashSessionToken(token))).toBe(true);
  });
});
