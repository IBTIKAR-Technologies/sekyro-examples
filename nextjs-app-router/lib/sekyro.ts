// One Sekyro AI client for the server. `server-only` makes a client-side
// import of this file a build error, so the key never reaches the browser.
import "server-only";
import { Sekyro } from "@sekyro/node";

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
