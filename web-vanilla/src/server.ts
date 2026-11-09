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
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const startSession = (locale: string) => call<StartedSession>("POST", "/sessions", { locale });
export const readVerdict = (sessionId: string) => call<Verdict>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
export const finishWithTestData = (sessionId: string) =>
  call<Verdict>("POST", `/demo/finish/${encodeURIComponent(sessionId)}`);
