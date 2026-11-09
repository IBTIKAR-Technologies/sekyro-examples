"use server";
// Server Actions: the only code that talks to Sekyro AI with the secret key.
import { SekyroApiError, type Session } from "@sekyro/node";
import { isSandboxKey, sekyro } from "@/lib/sekyro";

export interface StartedSession {
  sessionId: string;
  /** For the browser's SDK only, once. Never log it or put it in a URL. */
  clientToken: string;
  expiresAt: string;
}

export interface Verdict {
  sessionId: string;
  status: Session["status"];
  reason: Session["reason"] | null;
  closedBy: Session["closedBy"] | null;
  personId: string | null;
}

const LOCALES = ["ar", "fr", "en", "es", "pt", "de"] as const;

export async function startVerification(requestedLocale: string): Promise<StartedSession> {
  const locale = LOCALES.find((l) => l === requestedLocale);
  const created = await sekyro().sessions.create({
    ...(process.env.SEKYRO_FLOW ? { flow: process.env.SEKYRO_FLOW } : {}),
    ...(locale ? { locale } : {}),
  });
  return { sessionId: created.id, clientToken: created.clientToken, expiresAt: created.expiresAt };
}

/** The verdict that counts: read on the server, never taken from the browser. */
export async function readVerdict(sessionId: string): Promise<Verdict> {
  return toVerdict(await sekyro().sessions.get(sessionId));
}

/** Development only: ends a Sandbox session verified with test data. */
export async function finishWithTestData(sessionId: string): Promise<Verdict> {
  if (process.env.NODE_ENV !== "development" || !isSandboxKey()) {
    throw new Error("Finish with test data runs only in development with a Sandbox key");
  }
  try {
    return toVerdict(await sekyro().sessions.simulate(sessionId, { status: "verified" }));
  } catch (err) {
    if (err instanceof SekyroApiError) throw new Error(`Sekyro AI ${err.status} ${err.code}`);
    throw err;
  }
}

function toVerdict(session: Session): Verdict {
  return {
    sessionId: session.id,
    status: session.status,
    reason: session.reason ?? null,
    closedBy: session.closedBy ?? null,
    personId: session.personId ?? null,
  };
}
