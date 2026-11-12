// The webhook receiver. The signature covers the raw bytes: read
// `request.text()`, never `request.json()`. `verifyWebhook` uses node:crypto,
// so this handler runs on the Node runtime.
import { SekyroWebhookError, signatureFromHeaders, verifyWebhook } from "@sekyro/node";
import { after } from "next/server";
import { firstDelivery, remember } from "@/lib/events";
import { sekyro } from "@/lib/sekyro";
import { userStore } from "@/lib/users";
import { toVerdict } from "@/lib/verdict";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // Without a signing secret the app still runs: only this route is off.
  const secret = process.env.SEKYRO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn("SEKYRO_WEBHOOK_SECRET is not set: POST /api/webhooks/sekyro is off. Set it to receive webhooks.");
    return Response.json({ error: "webhooks_disabled" }, { status: 503 });
  }
  const rawBody = await request.text();
  const receivedAt = new Date().toISOString();
  try {
    const envelope = verifyWebhook(rawBody, signatureFromHeaders(request.headers), secret);
    const data = envelope.data as { sessionId?: string; status?: string };
    remember({ id: envelope.id, event: envelope.event, sessionId: data.sessionId ?? null, status: data.status ?? null, receivedAt, signature: "ok" });
    console.log(`webhook ${envelope.event} ${data.sessionId ?? ""} signature ok`);
    // Deliveries are at least once: handle each event id once. Events can arrive out of order,
    // so never apply the event's status: re-read the session after answering.
    const sessionId = data.sessionId;
    if (firstDelivery(envelope.id) && sessionId) {
      after(async () => {
        // The current state of the session, decided on this server, written to its user.
        const v = await toVerdict(await sekyro().sessions.get(sessionId));
        userStore().record(v);
        console.log(`session ${sessionId} is ${v.status}${v.reason ? ` (${v.reason})` : ""}: ${v.decision.show}`);
      });
    }
    return new Response(null, { status: 200 });
  } catch (err) {
    if (!(err instanceof SekyroWebhookError)) throw err;
    remember({ id: null, event: null, sessionId: null, status: null, receivedAt, signature: err.code });
    return new Response(err.code, { status: 400 });
  }
}
