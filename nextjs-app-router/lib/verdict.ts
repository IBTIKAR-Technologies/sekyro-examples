// The verdict that counts: a session read on the server, its result token verified here, and what the
// app decides. Used by the Server Actions and the webhook route.
import "server-only";
import type { Session } from "@sekyro/node";
import { decide, type Decision } from "./decide";
import { verifiedClaims } from "./sekyro";

export interface Verdict {
  sessionId: string;
  status: Session["status"];
  reason: Session["reason"] | null;
  closedBy: Session["closedBy"] | null;
  personId: string | null;
  /** Verified sessions only: the level and assurance of the result token, verified on this server. */
  verified: { level: number | null; assurance: string | null } | null;
  /** What the app does: access, what to show, whether to offer a new session (lib/decide.ts). */
  decision: Decision;
}

export async function toVerdict(session: Session): Promise<Verdict> {
  // A verified session: decide from the signed result token, checked here for this app and environment.
  const claims = session.status === "verified" ? await verifiedClaims(session.id) : null;
  return {
    sessionId: session.id,
    status: session.status,
    reason: session.reason ?? null,
    closedBy: session.closedBy ?? null,
    personId: claims?.personId ?? session.personId ?? null,
    verified: claims ? { level: claims.level, assurance: claims.assurance } : null,
    decision: decide(session, claims?.assurance ?? session.assurance),
  };
}
