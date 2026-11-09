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
  };
}

export function createExampleServer(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}`);
    return res.json();
  }

  return {
    /** POST /sessions: a new session and its client token. */
    createSession: async (locale?: string) => parseCreatedSession(await call('POST', '/sessions', locale ? { locale } : {})),
    /** GET /sessions/:id: the server's view of the session (the verdict once it is final). */
    getSession: async (id: string) => parseSessionView(await call('GET', `/sessions/${encodeURIComponent(id)}`)),
    /** A JSON call to the server; FinishWithTestData.tsx (development builds only) uses it for its one route. */
    request: call,
  };
}

export type ExampleServer = ReturnType<typeof createExampleServer>;
