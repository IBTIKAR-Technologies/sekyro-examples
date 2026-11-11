// The routes against a fake Sekyro AI API: no network, no key.
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sekyro } from "@sekyro/node";
import { createApp } from "../src/app.js";

const WEBHOOK_SECRET = "whsec_unit_test_only";
const SESSION_ID = "ses_unit_test";
const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A fake API: answers by method and path, records each call. */
function fakeApi(routes: Record<string, { status?: number; body: unknown }>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname.replace("/api/v2", "")}`;
    const route = routes[key];
    if (!route) return json(404, { success: false, error: { code: "not_found", message: key } });
    return json(route.status ?? 200, route.body);
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function start(apiKey: string, api: typeof fetch, webhookSecret: string | null = WEBHOOK_SECRET): Promise<string> {
  const app = createApp({
    sekyro: new Sekyro({ apiKey, fetch: api }),
    apiKey,
    ...(webhookSecret ? { webhookSecret } : {}),
    uiOrigins: ["http://localhost:5173"],
    resultToken: { appId: "app_unit_test", env: "sandbox" },
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function sign(body: string, secret = WEBHOOK_SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

const envelope = JSON.stringify({
  id: "evt_unit_test",
  event: "session.verified",
  version: 1,
  createdAt: new Date().toISOString(),
  orgId: "org_unit_test",
  env: "sandbox",
  data: { sessionId: SESSION_ID, status: "verified" },
});

describe("POST /sessions", () => {
  it("creates a session and returns only what the UI needs", async () => {
    const api = fakeApi({
      "POST /sessions": {
        status: 201,
        body: {
          success: true,
          data: { id: SESSION_ID, status: "created", clientToken: "ct_unit_test", hostedUrl: "https://verify.invalid/x", steps: [], expiresAt: "2030-01-01T00:00:00.000Z" },
        },
      },
    });
    const base = await start("sk_test_unit", api);
    const res = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ locale: "fr" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(await res.json()).toEqual({ sessionId: SESSION_ID, clientToken: "ct_unit_test", expiresAt: "2030-01-01T00:00:00.000Z" });
    const [, init] = api.mock.calls[0]!;
    const sent = JSON.parse(String(init?.body)) as { locale?: string; person?: { externalRef?: string } };
    expect(sent.locale).toBe("fr");
    // No externalRef in the request: the sample generates one standing in for your user id.
    expect(sent.person?.externalRef).toMatch(/^user_[0-9a-f-]{36}$/);
  });

  it("forwards the externalRef of the request as person.externalRef", async () => {
    const api = fakeApi({
      "POST /sessions": {
        status: 201,
        body: { success: true, data: { id: SESSION_ID, status: "created", clientToken: "ct_unit_test", hostedUrl: "https://verify.invalid/x", steps: [], expiresAt: "2030-01-01T00:00:00.000Z" } },
      },
    });
    const base = await start("sk_test_unit", api);
    const res = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalRef: "doctor-1" }),
    });
    expect(res.status).toBe(201);
    const [, init] = api.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ person: { externalRef: "doctor-1" } });
  });
});

describe("POST /webhooks/sekyro", () => {
  it("accepts a correctly signed delivery and lists it", async () => {
    const base = await start("sk_test_unit", fakeApi({}));
    const res = await fetch(`${base}/webhooks/sekyro`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sekyro-signature": sign(envelope) },
      body: envelope,
    });
    expect(res.status).toBe(200);
    const { events } = (await (await fetch(`${base}/events`)).json()) as { events: unknown[] };
    expect(events).toEqual([
      expect.objectContaining({ id: "evt_unit_test", event: "session.verified", sessionId: SESSION_ID, signature: "ok" }),
    ]);
  });

  it("without a signing secret the server runs and the webhook route is off", async () => {
    const base = await start("sk_test_unit", fakeApi({}), null);
    const res = await fetch(`${base}/webhooks/sekyro`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sekyro-signature": sign(envelope) },
      body: envelope,
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "webhooks_disabled" });
    expect((await fetch(`${base}/events`)).status).toBe(200);
  });

  it("refuses a delivery signed with another secret", async () => {
    const base = await start("sk_test_unit", fakeApi({}));
    const res = await fetch(`${base}/webhooks/sekyro`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sekyro-signature": sign(envelope, "whsec_other") },
      body: envelope,
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("invalid_signature");
  });
});

describe("POST /demo/finish/:id", () => {
  it("is refused with a Live key, before any API call", async () => {
    const api = fakeApi({});
    const base = await start("sk_live_unit", api);
    const res = await fetch(`${base}/demo/finish/${SESSION_ID}`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(api).not.toHaveBeenCalled();
  });

  it("finishes a Sandbox session verified and returns the verdict", async () => {
    const api = fakeApi({
      [`POST /sessions/${SESSION_ID}/simulate`]: {
        body: { success: true, data: { id: SESSION_ID, status: "verified", closedBy: "automatic", personId: "per_unit_test", steps: [], expiresAt: "2030-01-01T00:00:00.000Z" } },
      },
      // Result tokens off for this app: the verdict still comes from the session.
      [`GET /sessions/${SESSION_ID}/result-token`]: {
        status: 404,
        body: { success: false, error: { code: "not_found", message: "result tokens are off" } },
      },
    });
    const base = await start("sk_test_unit", api);
    const res = await fetch(`${base}/demo/finish/${SESSION_ID}`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: SESSION_ID,
      status: "verified",
      reason: null,
      closedBy: "automatic",
      personId: "per_unit_test",
      verified: null,
    });
    const [url, init] = api.mock.calls[0]!;
    expect(String(url)).toMatch(/\/sessions\/ses_unit_test\/simulate$/);
    expect(JSON.parse(String(init?.body))).toEqual({ status: "verified" });
  });
});
