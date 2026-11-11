// The Express app: every route of the sample, with its dependencies passed in
// so the tests can run it against a fake Sekyro AI API.
import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import {
  Sekyro,
  SekyroApiError,
  SekyroResultTokenError,
  SekyroWebhookError,
  signatureFromHeaders,
  verifyResultToken,
  verifyWebhook,
  type SekyroEnvironment,
  type Session,
  type VerifiedResult,
} from "@sekyro/node";

export interface AppConfig {
  sekyro: Sekyro;
  /** The secret key, read only to tell a Sandbox key (`sk_test_`) from a Live one. */
  apiKey: string;
  /**
   * The signing secret of the webhook endpoint that points at this server. Absent: the webhook
   * route is off and answers 503 `webhooks_disabled` (the rest of the server works).
   */
  webhookSecret?: string;
  /** The flow to run (slug or `flw_` id); absent runs the app's default flow. */
  flow?: string;
  /** Browser origins allowed to call this server (the UI samples' dev servers). */
  uiOrigins: string[];
  /** What the result token must say: the key's app and environment, from `GET /me` at startup. */
  resultToken: { appId: string; env: SekyroEnvironment; issuer?: string; fetch?: typeof fetch };
}

/** One webhook delivery as `GET /events` lists it. */
export interface ReceivedEvent {
  id: string | null;
  event: string | null;
  sessionId: string | null;
  status: string | null;
  receivedAt: string;
  /** `ok`, or why `verifyWebhook` refused the delivery. */
  signature: "ok" | SekyroWebhookError["code"];
}

/** What the UI samples read: the server-side verdict, never the browser's. */
export interface SessionVerdict {
  sessionId: string;
  status: Session["status"];
  reason: Session["reason"] | null;
  closedBy: Session["closedBy"] | null;
  personId: string | null;
  /** Verified sessions only: the claims of the signed result token, checked here. */
  verified: Pick<VerifiedResult, "level" | "assurance" | "verifiedAt" | "personId"> | null;
}

const MAX_EVENTS = 50;
const LOCALES = ["ar", "fr", "en", "es", "pt", "de"] as const;

export function createApp(config: AppConfig): express.Express {
  const { sekyro } = config;
  const events: ReceivedEvent[] = [];
  const app = express();

  app.use(cors(config.uiOrigins));

  // The signature covers the raw bytes: this route reads the body with
  // express.raw and is declared before any JSON parser.
  app.post("/webhooks/sekyro", express.raw({ type: "application/json" }), (req, res) => {
    if (!config.webhookSecret) {
      res.status(503).json({ error: "webhooks_disabled" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const receivedAt = new Date().toISOString();
    try {
      const envelope = verifyWebhook(rawBody, signatureFromHeaders(req.headers), config.webhookSecret);
      const data = envelope.data as { sessionId?: string; status?: string };
      remember(events, {
        id: envelope.id,
        event: envelope.event,
        sessionId: data.sessionId ?? null,
        status: data.status ?? null,
        receivedAt,
        signature: "ok",
      });
      console.log(`webhook ${envelope.event} ${data.sessionId ?? ""} signature ok`);
      // Acknowledge fast; real work (re-reading the session, updating your
      // user) goes after the response or into a queue.
      res.sendStatus(200);
    } catch (err) {
      if (!(err instanceof SekyroWebhookError)) throw err;
      remember(events, { id: null, event: null, sessionId: null, status: null, receivedAt, signature: err.code });
      console.warn(`webhook refused: ${err.code}`);
      res.status(400).send(err.code);
    }
  });

  app.use(express.json());

  app.post("/sessions", wrap(async (req, res) => {
    const requested: unknown = req.body?.locale;
    const locale = LOCALES.find((l) => l === requested);
    // Your own id for the person. In your app, pass your signed-in user's id here; a flow can
    // require it. This sample forwards the request's externalRef (`sekyro doctor` sends one),
    // else makes up a random id standing in for your user id.
    const sent: unknown = req.body?.externalRef;
    const externalRef = typeof sent === "string" && sent.trim() !== "" ? sent.trim().slice(0, 200) : `user_${randomUUID()}`;
    const created = await sekyro.sessions.create({
      ...(config.flow ? { flow: config.flow } : {}),
      ...(locale ? { locale } : {}),
      person: { externalRef },
    });
    // The client token goes to the device that runs the flow, once. Never log it.
    res.status(201).json({ sessionId: created.id, clientToken: created.clientToken, expiresAt: created.expiresAt });
  }));

  app.get("/sessions/:id", wrap(async (req, res) => {
    res.json(await verdict(config, await sekyro.sessions.get(param(req.params.id))));
  }));

  app.post("/demo/finish/:id", wrap(async (req, res) => {
    // Test data only ever runs with a Sandbox key.
    if (!config.apiKey.startsWith("sk_test_")) {
      res.status(403).json({ error: "sandbox_only" });
      return;
    }
    const session = await sekyro.test.sessions.simulate(param(req.params.id), { status: "verified" });
    res.json(await verdict(config, session));
  }));

  app.get("/events", (_req, res) => {
    res.json({ events });
  });

  app.use(apiErrors);
  return app;
}

async function verdict(config: AppConfig, session: Session): Promise<SessionVerdict> {
  let verified: SessionVerdict["verified"] = null;
  if (session.status === "verified") {
    try {
      const { token } = await config.sekyro.sessions.resultToken(session.id);
      const result = await verifyResultToken(token, {
        appId: config.resultToken.appId,
        env: config.resultToken.env,
        ...(config.resultToken.issuer ? { issuer: config.resultToken.issuer } : {}),
        ...(config.resultToken.fetch ? { fetch: config.resultToken.fetch } : {}),
      });
      verified = { level: result.level, assurance: result.assurance, verifiedAt: result.verifiedAt, personId: result.personId };
    } catch (err) {
      // Result tokens are off for the app, or the token did not check out:
      // the session view still holds the verdict.
      if (!(err instanceof SekyroApiError) && !(err instanceof SekyroResultTokenError)) throw err;
      console.warn(`result token unavailable: ${err.code}`);
    }
  }
  return {
    sessionId: session.id,
    status: session.status,
    reason: session.reason ?? null,
    closedBy: session.closedBy ?? null,
    personId: verified?.personId ?? session.personId ?? null,
    verified,
  };
}

function remember(events: ReceivedEvent[], event: ReceivedEvent): void {
  events.unshift(event);
  events.length = Math.min(events.length, MAX_EVENTS);
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

function cors(origins: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

const apiErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof SekyroApiError) {
    console.warn(`Sekyro AI ${err.status} ${err.code} (request ${err.requestId ?? "n/a"})`);
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({ error: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
