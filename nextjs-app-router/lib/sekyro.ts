// One Sekyro AI client for the server. `server-only` makes a client-side
// import of this file a build error, so the key never reaches the browser.
import "server-only";
import {
  Sekyro,
  SekyroApiError,
  SekyroResultTokenError,
  verifyResultToken,
  type SekyroEnvironment,
  type VerifiedResult,
} from "@sekyro/node";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

let client: Sekyro | undefined;

/** Created on first use, so `next build` runs without a key. */
export function sekyro(): Sekyro {
  client ??= new Sekyro({
    // A Sandbox key (sk_test_) runs in the Sandbox, a Live key in Live: same API, same code.
    apiKey: requireEnv("SEKYRO_API_KEY"),
    ...(process.env.SEKYRO_API_BASE_URL ? { baseUrl: process.env.SEKYRO_API_BASE_URL } : {}),
  });
  return client;
}

export const isSandboxKey = (): boolean => requireEnv("SEKYRO_API_KEY").startsWith("sk_test_");

let me: Promise<{ appId: string; env: SekyroEnvironment }> | undefined;

/** What a result token must say: this key's app and environment, read once from `GET /me`. */
export function tokenAudience(): Promise<{ appId: string; env: SekyroEnvironment }> {
  me ??= sekyro()
    .me()
    .then((m) => ({ appId: m.app.id, env: m.env }));
  return me;
}

/** The verified token's claims for a verified session, or null when result tokens are off for the app. */
export async function verifiedClaims(sessionId: string): Promise<VerifiedResult | null> {
  try {
    const { token } = await sekyro().sessions.resultToken(sessionId);
    const { appId, env } = await tokenAudience();
    const baseUrl = process.env.SEKYRO_API_BASE_URL;
    return await verifyResultToken(token, { appId, env, ...(baseUrl ? { issuer: new URL(baseUrl).origin } : {}) });
  } catch (err) {
    if (err instanceof SekyroApiError || err instanceof SekyroResultTokenError) {
      console.warn(`result token unavailable: ${err.code}`);
      return null;
    }
    throw err;
  }
}
