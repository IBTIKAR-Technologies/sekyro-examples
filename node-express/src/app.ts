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
import { decide, type Decision } from "./decide.js";
import { DEMO_USERS, type SessionKind, UserStore } from "./users.js";

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
  /** The flow for "Raise to Identity" (a `step_up`): it must prove Identity on every path. Default `identity`. */
  stepUpFlow?: string;
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
  /**
   * Verified sessions only: the claims of the signed result token, checked here. `level` is 1 Contact, 2 Human or
   * 3 Identity; to require a particular proof, compare `assurance` with a list, for example `["registry_biometric"]`.
   */
  verified: Pick<VerifiedResult, "level" | "assurance" | "verifiedAt" | "personId"> | null;
  /** What the app does: access, what to show, whether to offer a new session (src/decide.ts). */
  decision: Decision;
}

const MAX_EVENTS = 50;
const LOCALES = ["ar", "fr", "en", "es", "pt", "de"] as const;

export function createApp(config: AppConfig): express.Express {
  const { sekyro } = config;
  const events: ReceivedEvent[] = [];
  // Event ids already handled. Deliveries are at least once, with the same id on every retry.
  // In your app, keep these in your database.
  const seen = new Set<string>();
  // The demo users' verification state, kept current by webhooks and server reads.
  const users = new UserStore();
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
      // Acknowledge fast, then do the work.
      res.sendStatus(200);
      if (seen.has(envelope.id)) return; // a retry of an event already handled
      seen.add(envelope.id);
      // Events can arrive out of order: never apply the event's status, re-read the session.
      if (data.sessionId) {
        const sessionId = data.sessionId;
        sekyro.sessions
          .get(sessionId)
          .then((session) => verdict(config, session))
          .then((v) => users.record(v))
          .catch((err: unknown) => console.warn(`re-read ${sessionId} failed`, err));
      }
    } catch (err) {
      if (!(err instanceof SekyroWebhookError)) throw err;
      remember(events, { id: null, event: null, sessionId: null, status: null, receivedAt, signature: err.code });
      console.warn(`webhook refused: ${err.code}`);
      res.status(400).send(err.code);
    }
  });

  app.use(express.json());

  // The demo users. In your app, the signed-in user comes from your own session cookie.
  app.get("/users", (_req, res) => {
    res.json({ users: DEMO_USERS });
  });

  // What the page shows for a user: their stored state and whether a re-check is possible now.
  app.get("/users/:id", wrap(async (req, res) => {
    const userId = param(req.params.id);
    const state = users.get(userId);
    const [person] = await sekyro.people.list({ externalRef: userId, limit: 1 });
    res.json({
      ...state,
      personId: person?.id ?? state.personId,
      // True when the person is active, has a stored reference portrait and their last full
      // verification is within the flow's "Returning users" maximum age.
      returningReady: person?.returningReady ?? false,
      level: person?.level ?? null,
      assurance: person?.levelAssurance ?? null,
    });
  }));

  // "Verify": a full verification, created when the person clicks, never on render.
  app.post("/sessions", wrap(async (req, res) => {
    const requested: unknown = req.body?.locale;
    const locale = LOCALES.find((l) => l === requested);
    // Your own id for the person: the demo user's id, else the request's externalRef (`sekyro doctor`
    // sends one), else a random id standing in for your user id.
    const externalRef = userIdOf(req.body) ?? externalRefOf(req.body) ?? `user_${randomUUID()}`;
    // One idempotency key per click: the page sends the same attemptId when it retries after a
    // network error, so a retry returns the session already created instead of a second one.
    const created = await sekyro.sessions.create(
      {
        ...(config.flow ? { flow: config.flow } : {}),
        ...(locale ? { locale } : {}),
        person: { externalRef },
        // A reload or a second click gets the person's open session back (resumed: true).
        resumeOpen: true,
      },
      { idempotencyKey: attemptIdOf(req.body) },
    );
    users.started(externalRef, created.id, "full");
    // The client token goes to the device that runs the flow, once. Never log it.
    res.status(created.resumed ? 200 : 201).json({
      sessionId: created.id,
      clientToken: created.clientToken,
      expiresAt: created.expiresAt,
      resumed: created.resumed === true,
    });
  }));

  // "Confirm it is you": a re-check of a returning person. Only liveness and a face match against the
  // portrait stored at their last full verification, so it works on any device: nothing is tied to
  // the device used the first time. Not possible: the page runs a full verification instead.
  app.post("/sessions/recheck", wrap(async (req, res) => {
    const externalRef = userIdOf(req.body) ?? externalRefOf(req.body);
    if (!externalRef) {
      res.status(400).json({ error: "external_ref_required" });
      return;
    }
    const [person] = await sekyro.people.list({ externalRef, limit: 1 });
    if (!person?.returningReady) {
      res.status(409).json({ error: "not_returning_ready", next: "full_verification", message: FALLBACK.not_returning_ready });
      return;
    }
    await personSession(res, externalRef, "recheck", () =>
      sekyro.sessions.create(
        { ...(config.flow ? { flow: config.flow } : {}), person: { reuse: { externalRef, mode: "recheck" } }, resumeOpen: true },
        { idempotencyKey: attemptIdOf(req.body) },
      ),
    );
  }));

  // "Raise to Identity": a step-up from Human to Identity, on one live capture matched to the stored face.
  app.post("/sessions/step-up", wrap(async (req, res) => {
    const externalRef = userIdOf(req.body) ?? externalRefOf(req.body);
    if (!externalRef) {
      res.status(400).json({ error: "external_ref_required" });
      return;
    }
    await personSession(res, externalRef, "step_up", () =>
      sekyro.people.createSession(
        externalRef,
        { mode: "step_up", flow: config.stepUpFlow ?? "identity", resumeOpen: true },
        { idempotencyKey: attemptIdOf(req.body) },
      ),
    );
  }));

  /** Creates a session for a known person; a person who cannot use it gets a full verification instead. */
  async function personSession(
    res: express.Response,
    externalRef: string,
    kind: SessionKind,
    create: () => Promise<{ id: string; clientToken: string; expiresAt: string }>,
  ): Promise<void> {
    try {
      const created = await create();
      users.started(externalRef, created.id, kind);
      res.status(201).json({ sessionId: created.id, clientToken: created.clientToken, expiresAt: created.expiresAt });
    } catch (err) {
      const code = err instanceof SekyroApiError ? err.code : undefined;
      if (code !== undefined && code in FALLBACK) {
        res.status(409).json({ error: code, next: "full_verification", message: FALLBACK[code] });
        return;
      }
      throw err;
    }
  }

  // The verdict that counts, read on the server. The page calls it when the SDK says a verdict exists.
  app.get("/sessions/:id", wrap(async (req, res) => {
    const v = await verdict(config, await sekyro.sessions.get(param(req.params.id)));
    users.record(v);
    res.json(v);
  }));

  app.post("/demo/finish/:id", wrap(async (req, res) => {
    // Test data only ever runs with a Sandbox key.
    if (!config.apiKey.startsWith("sk_test_")) {
      res.status(403).json({ error: "sandbox_only" });
      return;
    }
    const session = await sekyro.test.sessions.simulate(param(req.params.id), { status: "verified" });
    const v = await verdict(config, session);
    users.record(v);
    res.json(v);
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
    // Decide from the verified token's assurance when there is one, else from the session view.
    decision: decide(session, verified?.assurance ?? session.assurance),
  };
}

/** Why a known person cannot use a re-check or step-up now: the page offers a full verification. */
const FALLBACK: Record<string, string> = {
  not_returning_ready: "We need a full verification first: there is no recent verified portrait to compare with.",
  subject_not_found: "We need a full verification first: this person has not passed one yet.",
  subject_no_reference: "We need a full verification first: there is no verified portrait to compare with.",
  subject_stale: "The last full verification is too old. Please verify again in full.",
  reuse_disabled: "This flow does not re-check returning people. Please verify in full.",
  subject_revoked: "This verification was withdrawn. Please verify again in full.",
  step_up_flow_too_weak: "The step-up flow does not prove Identity on every path. Set SEKYRO_STEP_UP_FLOW to an Identity flow.",
};

/** A demo user's id from the request, or undefined. */
function userIdOf(body: unknown): string | undefined {
  const sent = (body as { userId?: unknown } | undefined)?.userId;
  return DEMO_USERS.find((u) => u.id === sent)?.id;
}

/** The request's externalRef, trimmed, or undefined. */
function externalRefOf(body: unknown): string | undefined {
  const sent = (body as { externalRef?: unknown } | undefined)?.externalRef;
  return typeof sent === "string" && sent.trim() !== "" ? sent.trim().slice(0, 200) : undefined;
}

/** The client's attemptId (one per click, reused on a retry), else a new key for this request. */
function attemptIdOf(body: unknown): string {
  const sent = (body as { attemptId?: unknown } | undefined)?.attemptId;
  return typeof sent === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(sent) ? sent : randomUUID();
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
  if (err instanceof SekyroApiError && err.status === 429) {
    // A rate limit: tell the page how long to wait before it offers to try again.
    res.status(429).json({ error: err.code, retryAfterSeconds: err.retryAfterSeconds ?? 60 });
    return;
  }
  if (err instanceof SekyroApiError) {
    console.warn(`Sekyro AI ${err.status} ${err.code} (request ${err.requestId ?? "n/a"})`);
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({ error: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
