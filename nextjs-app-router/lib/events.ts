// The last webhook deliveries, in memory, for the page to show. A real app
// stores them, and the event ids it handled, in its database.
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

const seen = globalThis as typeof globalThis & { __sekyroSeen?: Set<string> };

/** True the first time an event id is seen. Deliveries are at least once, with the same id on every retry. */
export function firstDelivery(id: string): boolean {
  const ids = (seen.__sekyroSeen ??= new Set<string>());
  if (ids.has(id)) return false;
  ids.add(id);
  return true;
}
