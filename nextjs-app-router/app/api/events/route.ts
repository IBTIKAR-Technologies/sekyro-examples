import { events } from "@/lib/events";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ events: events() });
}
