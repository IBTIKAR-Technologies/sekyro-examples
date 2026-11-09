// One Sekyro AI client for the whole server, from the environment.
import { Sekyro } from "@sekyro/node";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const apiKey = requireEnv("SEKYRO_API_KEY");

// A Sandbox key (sk_test_) runs in the Sandbox, a Live key in Live: same API, same code.
export const sekyro = new Sekyro({
  apiKey,
  ...(process.env.SEKYRO_API_BASE_URL ? { baseUrl: process.env.SEKYRO_API_BASE_URL } : {}),
});
