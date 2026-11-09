// The webhook receiver. The signature covers the raw bytes: read
// `request.text()`, never `request.json()`. `verifyWebhook` uses node:crypto,
// so this handler runs on the Node runtime.
import { SekyroWebhookError, signatureFromHeaders, verifyWebhook } from "@sekyro/node";
import { remember } from "@/lib/events";
import { requireEnv } from "@/lib/sekyro";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const receivedAt = new Date().toISOString();
  try {
    const envelope = verifyWebhook(rawBody, signatureFromHeaders(request.headers), requireEnv("SEKYRO_WEBHOOK_SECRET"));
    const data = envelope.data as { sessionId?: string; status?: string };
    remember({ id: envelope.id, event: envelope.event, sessionId: data.sessionId ?? null, status: data.status ?? null, receivedAt, signature: "ok" });
    console.log(`webhook ${envelope.event} ${data.sessionId ?? ""} signature ok`);
    // Acknowledge fast. Deliveries are at least once: de-duplicate on envelope.id.
    return new Response(null, { status: 200 });
  } catch (err) {
    if (!(err instanceof SekyroWebhookError)) throw err;
    remember({ id: null, event: null, sessionId: null, status: null, receivedAt, signature: err.code });
    return new Response(err.code, { status: 400 });
  }
}
