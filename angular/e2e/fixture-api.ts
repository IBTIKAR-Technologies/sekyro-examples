// Fixture mode for the e2e: Playwright answers, in the page, the sample server's routes (POST /sessions,
// GET /sessions/:id) and the Sekyro AI hosted API the element calls, from one Sandbox session view
// (fixtures/session-view.json). The Sandbox skip passes the face step and the session ends verified. Nothing leaves
// the machine and no key is needed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

/** Stands in for the hosted challenge frame: answers every request with a fixture token. */
const CHALLENGE_FRAME = `<!doctype html><script>
parent.postMessage({ type: "sekyro.challenge.ready", v: 1 }, "*");
addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.type !== "sekyro.challenge.request") return;
  e.source.postMessage({ type: "sekyro.challenge.token", v: 1, id: m.id, token: "fixture-token" }, e.origin);
});
</script>`;

const SERVER = "http://localhost:4000";
const API = "https://api.sekyro.ai";

type Json = Record<string, any>;

export interface Fixture {
  /** Every call the page made, as `METHOD url-path`. */
  calls: string[];
}

export async function installFixture(page: Page): Promise<Fixture> {
  let view: Json = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/session-view.json"), "utf8"));
  view.expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const calls: string[] = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });

  // The sample server (examples/node-express).
  await page.route(`${SERVER}/**`, (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${path}`);
    if (req.method() === "POST" && path === "/sessions") {
      return json(route, 201, { sessionId: view.sessionId, clientToken: "fixture-client-token", expiresAt: view.expiresAt });
    }
    if (req.method() === "GET" && path === "/users") {
      return json(route, 200, { users: [{ id: "demo-user-1", label: "Demo user 1" }] });
    }
    if (req.method() === "GET" && path.startsWith("/users/")) {
      return json(route, 200, {
        userId: "demo-user-1",
        personId: null,
        sessionId: null,
        kind: null,
        status: null,
        reason: null,
        closedBy: null,
        decision: null,
        returningReady: false,
        level: null,
        assurance: null,
      });
    }
    if (req.method() === "GET" && path.startsWith("/sessions/")) {
      return json(route, 200, {
        sessionId: view.sessionId,
        status: view.status,
        reason: null,
        closedBy: view.status === "verified" ? "automatic" : null,
        personId: null,
        verified: null,
        decision: view.status === "verified" ? { access: true, show: "verified", canRetry: false } : { access: false, show: "continue", canRetry: false },
      });
    }
    return json(route, 404, { error: "not_found" });
  });

  // The Sekyro AI hosted API.
  await page.route(`${API}/**`, (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace(/^\/api\/v2/, "");
    calls.push(`${req.method()} ${path}`);
    const ok = (data: unknown) => json(route, 200, { success: true, data });
    if (path === "/hosted/session") return ok(view);
    if (path === "/hosted/consent") {
      view = { ...view, consentRecorded: true };
      return ok({ ...view, alreadyRecorded: false });
    }
    if (path === "/hosted/capture-issue") return route.fulfill({ status: 204, headers: cors });
    const check = /^\/sessions\/[^/]+\/checks\/([a-z_]+)$/.exec(path);
    if (check !== null) {
      const input = ((req.postDataJSON() as Json | null)?.input ?? {}) as Json;
      if (input.simulatedCapture === true && view.simulation?.skipCapture === true) {
        const next = structuredClone(view);
        for (const step of next.plan.steps as Json[]) if (step.checkType === check[1]) step.state = "passed";
        const open = (next.plan.steps as Json[]).find((s) => s.state !== "passed" && s.state !== "skipped");
        next.plan.current = open?.id ?? null;
        next.status = open === undefined ? "verified" : "in_progress";
        if (open === undefined) next.closedBy = "automatic";
        view = next;
      }
      return ok(view);
    }
    return ok(view);
  });

  // The challenge frame (the SDK embeds the view's `challenge.url`) and the branding logo.
  await page.route("https://verify.sekyro.ai/challenge**", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/html" }, body: CHALLENGE_FRAME }),
  );
  await page.route("https://assets.sekyro.ai/**", (route) => route.fulfill({ status: 404, headers: cors, body: "" }));
  return { calls };
}
