// The calls this app makes to examples/node-express. The server holds the API key; the app only ever sees a
// one-time client token and the session's status.

export type SessionStatus = 'created' | 'in_progress' | 'review_pending' | 'verified' | 'not_verified';

export interface CreatedSession {
  sessionId: string;
  clientToken: string;
  expiresAt: string;
}

export interface SessionView {
  sessionId: string;
  status: SessionStatus | (string & {});
  reason?: string;
  closedBy?: string;
  personId?: string;
  /** What the server decided (`decision.show`, for example `in_review` or `try_again`). */
  show?: string;
  /** The server offers a new session. */
  canRetry?: boolean;
}

/** The demo user this app is signed in as: a fixed id, no personal data. It is the person's externalRef. */
export const DEMO_USER_ID = 'demo-user-1';

/** A refused re-check: the person needs a full verification first. The message says why. */
export class FallbackError extends Error {}

/** One idempotency key per tap: the server returns the same session if this request is retried. */
function attemptId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

const TERMINAL: ReadonlySet<string> = new Set(['verified', 'not_verified']);

/** True once the server has a final verdict (the session will not change any more). */
export function isTerminal(view: SessionView): boolean {
  return TERMINAL.has(view.status);
}

function str(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function need(body: Record<string, unknown>, key: string): string {
  const v = str(body, key);
  if (v === undefined) throw new Error(`The server response has no "${key}"`);
  return v;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('The server did not answer with a JSON object');
  return body as Record<string, unknown>;
}

export function parseCreatedSession(body: unknown): CreatedSession {
  const o = asObject(body);
  return { sessionId: need(o, 'sessionId'), clientToken: need(o, 'clientToken'), expiresAt: need(o, 'expiresAt') };
}

export function parseSessionView(body: unknown): SessionView {
  const o = asObject(body);
  return {
    sessionId: need(o, 'sessionId'),
    status: need(o, 'status'),
    reason: str(o, 'reason'),
    closedBy: str(o, 'closedBy'),
    personId: str(o, 'personId'),
    ...decisionOf(o.decision),
  };
}

function decisionOf(d: unknown): { show?: string; canRetry?: boolean } {
  if (typeof d !== 'object' || d === null) return {};
  const o = d as Record<string, unknown>;
  return { show: str(o, 'show'), canRetry: o.canRetry === true };
}

export function createExampleServer(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 409) {
      const refused = asObject(await res.json());
      if (refused.next === 'full_verification') throw new FallbackError(str(refused, 'message') ?? 'Please verify in full.');
    }
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}`);
    return res.json();
  }

  return {
    /** POST /sessions: a full verification for the demo user, created when the person taps Verify. */
    createSession: async (locale?: string) =>
      parseCreatedSession(await call('POST', '/sessions', { userId: DEMO_USER_ID, attemptId: attemptId(), ...(locale ? { locale } : {}) })),
    /**
     * POST /sessions/recheck: "Confirm it is you" for a returning person, on any device. Throws FallbackError when
     * the person needs a full verification first.
     */
    createRecheck: async () => parseCreatedSession(await call('POST', '/sessions/recheck', { userId: DEMO_USER_ID, attemptId: attemptId() })),
    /** GET /sessions/:id: the server's view of the session (the verdict once it is final). */
    getSession: async (id: string) => parseSessionView(await call('GET', `/sessions/${encodeURIComponent(id)}`)),
    /** A JSON call to the server; FinishWithTestData.tsx (development builds only) uses it for its one route. */
    request: call,
  };
}

export type ExampleServer = ReturnType<typeof createExampleServer>;
