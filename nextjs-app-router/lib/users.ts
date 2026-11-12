// The demo users and what this server knows about their verification. In your app these are your
// signed-in users and a few columns on your user table: keep the Sekyro AI person id and the
// latest decision, written by the webhook and by your server's own reads, never by the browser.
import "server-only";
import type { Decision } from "./decide";

/** Fixed demo users, no personal data. Their id is the externalRef: your own id for the person. */
export const DEMO_USERS = [
  { id: "demo-user-1", label: "Demo user 1" },
  { id: "demo-user-2", label: "Demo user 2" },
] as const;

export type SessionKind = "full" | "recheck" | "step_up";

export interface UserState {
  userId: string;
  /** The Sekyro AI person (`per_...`), once the user passed a verification. */
  personId: string | null;
  /** The latest session and what the server decided about it. */
  sessionId: string | null;
  kind: SessionKind | null;
  status: string | null;
  reason: string | null;
  closedBy: string | null;
  decision: Decision | null;
  updatedAt: string | null;
}

class UserStore {
  private readonly users = new Map<string, UserState>();
  /** Which user and kind each session belongs to, so a webhook can find its user. */
  private readonly sessions = new Map<string, { userId: string; kind: SessionKind }>();

  get(userId: string): UserState {
    return (
      this.users.get(userId) ?? {
        userId,
        personId: null,
        sessionId: null,
        kind: null,
        status: null,
        reason: null,
        closedBy: null,
        decision: null,
        updatedAt: null,
      }
    );
  }

  started(userId: string, sessionId: string, kind: SessionKind): void {
    this.sessions.set(sessionId, { userId, kind });
    this.users.set(userId, { ...this.get(userId), sessionId, kind, status: "created", reason: null, closedBy: null, decision: null, updatedAt: new Date().toISOString() });
  }

  /** Records a server-side read of a session. Older sessions of the user never overwrite a newer one. */
  record(v: { sessionId: string; status: string; reason?: string | null; closedBy?: string | null; personId: string | null; decision: Decision }): void {
    const owner = this.sessions.get(v.sessionId);
    if (!owner) return;
    const state = this.get(owner.userId);
    if (state.sessionId !== null && state.sessionId !== v.sessionId) return;
    this.users.set(owner.userId, {
      ...state,
      personId: v.personId ?? state.personId,
      sessionId: v.sessionId,
      kind: owner.kind,
      status: v.status,
      reason: v.reason ?? null,
      closedBy: v.closedBy ?? null,
      decision: v.decision,
      updatedAt: new Date().toISOString(),
    });
  }
}

// On globalThis so the Server Actions, the webhook route and the dev server's reloads share one store.
const g = globalThis as typeof globalThis & { __sekyroUsers?: UserStore };

export function userStore(): UserStore {
  return (g.__sekyroUsers ??= new UserStore());
}
