// The calls to the sample server (examples/node-express). The API key stays
// there: the page only ever holds the session's one-time client token.
// Set at build time from EXAMPLE_SERVER_URL (scripts/ng.mjs passes it to `ng` as `--define`).
import { Injectable } from "@angular/core";
declare const EXAMPLE_SERVER_URL: string;
const SERVER_URL = EXAMPLE_SERVER_URL;

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


/** The sample server's calls for the page: the client token and the verdict. (The test finish is development-only.) */
@Injectable({ providedIn: "root" })
export class VerificationService {
  readonly start = startSession;
  readonly verdict = readVerdict;
}
