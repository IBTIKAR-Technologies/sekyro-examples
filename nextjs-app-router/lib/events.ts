// The last webhook deliveries, in memory, for the page to show. A real app
// stores them (and de-duplicates on the envelope id) in its database.
import "server-only";

export interface ReceivedEvent {
  id: string | null;
  event: string | null;
  sessionId: string | null;
  status: string | null;
  receivedAt: string;
  /** `ok`, or why `verifyWebhook` refused the delivery. */
  signature: string;
}

// On globalThis so the route handlers and the dev server's reloads share one list.
const store = globalThis as typeof globalThis & { __sekyroEvents?: ReceivedEvent[] };

export function events(): ReceivedEvent[] {
  return (store.__sekyroEvents ??= []);
}

export function remember(event: ReceivedEvent): void {
  const list = events();
  list.unshift(event);
  list.length = Math.min(list.length, 50);
}
