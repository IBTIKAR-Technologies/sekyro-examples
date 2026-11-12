"use server";
// Server Actions: the only code that talks to Sekyro AI with the secret key. Every action that
// creates a session is called when the person clicks, never on render.
import { randomUUID } from "node:crypto";
import { SekyroApiError, type Session } from "@sekyro/node";
import { isSandboxKey, sekyro } from "@/lib/sekyro";
import { DEMO_USERS, type SessionKind, type UserState, userStore } from "@/lib/users";
import { toVerdict, type Verdict } from "@/lib/verdict";

export type { Verdict } from "@/lib/verdict";

export interface StartedSession {
  sessionId: string;
  /** For the browser's SDK only, once. Never log it or put it in a URL. */
  clientToken: string;
  expiresAt: string;
}

/** A refused re-check or step-up: the page offers a full verification with `message`. */
export interface Fallback {
  fallback: true;
  code: string;
  message: string;
}

export interface UserView extends UserState {
  /** A re-check ("Confirm it is you") is possible now. */
  returningReady: boolean;
  level: number | null;
  assurance: string | null;
}

const LOCALES = ["ar", "fr", "en", "es", "pt", "de"] as const;

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

/** In your app the signed-in user comes from your own session; here, one of the fixed demo users. */
function demoUser(userId: string): string {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) throw new Error("Unknown demo user");
  return user.id;
}

/** One idempotency key per click: the page sends the same attemptId when it retries. */
function key(attemptId: string): string {
  return /^[A-Za-z0-9_-]{8,100}$/.test(attemptId) ? attemptId : randomUUID();
}

export async function listUsers(): Promise<{ id: string; label: string }[]> {
  return DEMO_USERS.map((u) => ({ ...u }));
}

/** What the page shows for a user: their stored state and whether a re-check is possible now. */
export async function readUser(userId: string): Promise<UserView> {
  const id = demoUser(userId);
  const state = userStore().get(id);
  const [person] = await sekyro().people.list({ externalRef: id, limit: 1 });
  return {
    ...state,
    personId: person?.id ?? state.personId,
    returningReady: person?.returningReady ?? false,
    level: person?.level ?? null,
    assurance: person?.levelAssurance ?? null,
  };
}

/** "Verify": a full verification for the signed-in user, their id as the externalRef. */
export async function startVerification(userId: string, requestedLocale: string, attemptId: string): Promise<StartedSession> {
  const externalRef = demoUser(userId);
  const locale = LOCALES.find((l) => l === requestedLocale);
  const created = await sekyro().sessions.create(
    {
      ...(process.env.SEKYRO_FLOW ? { flow: process.env.SEKYRO_FLOW } : {}),
      ...(locale ? { locale } : {}),
      person: { externalRef },
      // A reload or a second click gets the person's open session back (resumed: true).
      resumeOpen: true,
    },
    { idempotencyKey: key(attemptId) },
  );
  userStore().started(externalRef, created.id, "full");
  return { sessionId: created.id, clientToken: created.clientToken, expiresAt: created.expiresAt };
}

/**
 * "Confirm it is you": a re-check. Only liveness and a face match against the portrait stored at the
 * person's last full verification, so it works on any device.
 */
export async function startRecheck(userId: string, attemptId: string): Promise<StartedSession | Fallback> {
  const externalRef = demoUser(userId);
  const [person] = await sekyro().people.list({ externalRef, limit: 1 });
  if (!person?.returningReady) return { fallback: true, code: "not_returning_ready", message: FALLBACK.not_returning_ready! };
  return personSession(externalRef, "recheck", () =>
    sekyro().sessions.create(
      { ...(process.env.SEKYRO_FLOW ? { flow: process.env.SEKYRO_FLOW } : {}), person: { reuse: { externalRef, mode: "recheck" } }, resumeOpen: true },
      { idempotencyKey: key(attemptId) },
    ),
  );
}

/** "Raise to Identity": a step-up from Human to Identity on one live capture matched to the stored face. */
export async function startStepUp(userId: string, attemptId: string): Promise<StartedSession | Fallback> {
  const externalRef = demoUser(userId);
  return personSession(externalRef, "step_up", () =>
    sekyro().people.createSession(
      externalRef,
      { mode: "step_up", flow: process.env.SEKYRO_STEP_UP_FLOW || "identity", resumeOpen: true },
      { idempotencyKey: key(attemptId) },
    ),
  );
}

async function personSession(
  externalRef: string,
  kind: SessionKind,
  create: () => Promise<{ id: string; clientToken: string; expiresAt: string }>,
): Promise<StartedSession | Fallback> {
  try {
    const created = await create();
    userStore().started(externalRef, created.id, kind);
    return { sessionId: created.id, clientToken: created.clientToken, expiresAt: created.expiresAt };
  } catch (err) {
    if (err instanceof SekyroApiError && FALLBACK[err.code]) return { fallback: true, code: err.code, message: FALLBACK[err.code]! };
    throw err;
  }
}

/** The verdict that counts: read on the server, never taken from the browser. */
export async function readVerdict(sessionId: string): Promise<Verdict> {
  return record(await sekyro().sessions.get(sessionId));
}

/** Development only: ends a Sandbox session verified with test data. */
export async function finishWithTestData(sessionId: string): Promise<Verdict> {
  if (process.env.NODE_ENV !== "development" || !isSandboxKey()) {
    throw new Error("Finish with test data runs only in development with a Sandbox key");
  }
  try {
    return await record(await sekyro().test.sessions.simulate(sessionId, { status: "verified" }));
  } catch (err) {
    if (err instanceof SekyroApiError) throw new Error(`Sekyro AI ${err.status} ${err.code}`);
    throw err;
  }
}

async function record(session: Session): Promise<Verdict> {
  const v = await toVerdict(session);
  userStore().record(v);
  return v;
}
