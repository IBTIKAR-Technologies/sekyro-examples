// The calls to the sample server (examples/node-express). The API key stays
// there: the page only ever holds the session's one-time client token.
const SERVER_URL = import.meta.env.EXAMPLE_SERVER_URL || "http://localhost:4000";

export interface StartedSession {
  sessionId: string;
  clientToken: string;
  expiresAt: string;
}

export interface Verdict {
  sessionId: string;
  status: "created" | "in_progress" | "review_pending" | "verified" | "not_verified";
  reason: string | null;
  closedBy: string | null;
  personId: string | null;
  verified: { level: number | null; assurance: string | null; verifiedAt: string } | null;
  /** What the server decided: access, what to show, whether to offer a new session. */
  decision: { access: boolean; show: string; canRetry: boolean; next?: string };
}

/** A demo user and what the server knows about them (GET /users/:id). */
export interface UserView {
  userId: string;
  personId: string | null;
  sessionId: string | null;
  kind: "full" | "recheck" | "step_up" | null;
  status: string | null;
  reason: string | null;
  closedBy: string | null;
  decision: Verdict["decision"] | null;
  /** A re-check ("Confirm it is you") is possible now. */
  returningReady: boolean;
  level: number | null;
  assurance: string | null;
}

/** A refused re-check or step-up: the page offers a full verification with this message. */
export class FallbackError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What to tell the person for each decision of the server (`decision.show`). */
export const MESSAGES: Record<string, string> = {
  verified: "You are verified.",
  needs_stronger_proof: "This verification does not prove enough for this action.",
  in_review: "We are checking your verification and will let you know.",
  continue: "Your verification is not finished. You can continue it.",
  expired: "Your verification link expired. You can start again.",
  rejected: "We could not verify you. Contact us if you think this is wrong.",
  try_again: "We could not complete the check. Try again in good light.",
  try_later: "Verification is unavailable right now. Try again later.",
  policy: "Your verification does not meet a rule of this service.",
  cancelled: "This verification was cancelled.",
  follow_newer: "A newer verification replaced this one.",
  not_verified: "You are not verified.",
};

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { error?: string; next?: string; message?: string };
    if (body.next === "full_verification") throw new FallbackError(body.error ?? "fallback", body.message ?? "Please verify in full.");
  }
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * Call it when the person clicks Start, never on render. Make `attemptId` once per click and send
 * the same one if you retry after a network error: the server returns the same session.
 */
export const startSession = (userId: string, locale: string, attemptId: string = crypto.randomUUID()) =>
  call<StartedSession>("POST", "/sessions", { userId, locale, attemptId });
/** "Confirm it is you": a re-check of a returning person. Throws FallbackError when a full verification is needed. */
export const startRecheck = (userId: string, attemptId: string = crypto.randomUUID()) =>
  call<StartedSession>("POST", "/sessions/recheck", { userId, attemptId });
/** "Raise to Identity": a step-up. Throws FallbackError when a full verification is needed. */
export const startStepUp = (userId: string, attemptId: string = crypto.randomUUID()) =>
  call<StartedSession>("POST", "/sessions/step-up", { userId, attemptId });
export const listUsers = () => call<{ users: { id: string; label: string }[] }>("GET", "/users");
export const readUser = (userId: string) => call<UserView>("GET", `/users/${encodeURIComponent(userId)}`);
export const readVerdict = (sessionId: string) => call<Verdict>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
export const finishWithTestData = (sessionId: string) =>
  call<Verdict>("POST", `/demo/finish/${encodeURIComponent(sessionId)}`);
