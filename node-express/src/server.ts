// Entry point: reads the configuration, asks Sekyro AI which key this is, listens.
import { SekyroApiError } from "@sekyro/node";
import { createApp } from "./app.js";
import { apiKey, requireEnv, sekyro } from "./sekyro.js";

const me = await sekyro.me().catch((err: unknown) => {
  if (err instanceof SekyroApiError) {
    console.error(`Sekyro AI refused GET /me: ${err.status} ${err.code}. Check SEKYRO_API_KEY.`);
    process.exit(1);
  }
  throw err;
});
const port = Number(process.env.PORT || 4000);
const baseUrl = process.env.SEKYRO_API_BASE_URL;

const app = createApp({
  sekyro,
  apiKey,
  webhookSecret: requireEnv("SEKYRO_WEBHOOK_SECRET"),
  ...(process.env.SEKYRO_FLOW ? { flow: process.env.SEKYRO_FLOW } : {}),
  uiOrigins: (process.env.EXAMPLE_UI_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // The result token is checked against this key's app and environment, never
  // against what the token itself claims.
  resultToken: { appId: me.app.id, env: me.env, ...(baseUrl ? { issuer: new URL(baseUrl).origin } : {}) },
});

app.listen(port, () => {
  console.log(`Sekyro AI example server on http://localhost:${port} (${me.env} key, app ${me.app.id})`);
});
