# Sekyro AI: Next.js App Router example

The three pieces of a Sekyro integration in one Next.js app:

| Piece | File |
|---|---|
| A Server Action creates the session with [`@sekyro/node`](https://www.npmjs.com/package/@sekyro/node) and reads the verdict | `app/actions.ts` |
| A client component runs the flow with `<SekyroVerification>` from [`@sekyro/react`](https://www.npmjs.com/package/@sekyro/react) | `app/verification.tsx` |
| A route handler receives the webhook on the Node runtime and checks its signature over the raw body | `app/api/webhooks/sekyro/route.ts` |

The secret key stays on the server (`lib/sekyro.ts` imports `server-only`). The page itself is a Server Component that
renders the shell; `@sekyro/react` ships its components as client components, so they render in a client boundary
without extra setup.

## Prerequisites

- Node.js 22 or later
- A Sandbox secret key (dashboard: your app, then API keys)
- `http://localhost:3000` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web)

## Run

```sh
npm install
cp .env.example .env.local     # then fill in SEKYRO_API_KEY and, once you have one, SEKYRO_WEBHOOK_SECRET
npm run dev                    # http://localhost:3000
```

`npm run dev` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256 (`assetBaseUrl="/models-v3"`).

Pick a language, pick a demo user, click **Verify**, and follow the screens. The page shows the server's verdict and the
webhooks this app received for the session.

Checks: `npm run build` and `npm run typecheck`.

## Finish with test data

In `npm run dev`, a **Finish with test data** button appears once a session starts. It calls the
`finishWithTestData` Server Action, which ends the Sandbox session `verified` with
`sekyro.test.sessions.simulate(id, { status: "verified" })`. The action refuses outside `next dev` and with a Live key,
and a production build does not render the button.

## Receive the webhook

Forward Sandbox webhooks to the route handler with the Sekyro CLI. Sign in once: the command opens your browser,
where you approve the login with Sandbox full access, and keeps an access token on your machine.

```sh
npx @sekyro/cli login
```

Then, in a second terminal:

```sh
npx @sekyro/cli listen --forward-to http://localhost:3000/api/webhooks/sekyro
```

It prints the signing secret of its forwarding endpoint: put it in `SEKYRO_WEBHOOK_SECRET` and restart. Pass `--keep` to keep the same endpoint and secret between
runs. After a finish, the page lists `session.started` and
`session.verified` with `signature: "ok"`. The list lives in memory (`lib/events.ts`); a real app stores deliveries
and de-duplicates them on the envelope `id`.

## How this example is built

Each part follows a rule of [Best practices](https://docs.sekyro.ai/en/getting-started/best-practices).

| Rule | In this example |
|---|---|
| Keep keys on the server | The API key and the webhook secret live only in the Server Actions and the webhook route (`.env.local`); the page or app gets the session's client token. |
| Pass a stable external reference | "Signed in as" picks a fixed demo user. Its id is the session's `person.externalRef`. |
| Create the session on click | The client component asks for a session only when the person presses Verify or Confirm it is you. |
| Resume the open session | Every create sends `resumeOpen: true` with the person key, so a reload or a second click gets the open session back (`resumed: true`, the same client token). |
| Send an idempotency key | Each press makes one `attemptId`; The server sends it as `X-Idempotency-Key`. |
| Decide on your server | The server reads the session and decides; the SDK's result is display only. |
| Check, de-duplicate and order webhooks | The server verifies the signature on the raw body, handles each event `id` once, and re-reads the session instead of trusting the event's status. |
| Handle every outcome | `decide()` has a branch for every status and every `not_verified` reason, with what to show and whether to offer a new session. An expired link (`closedBy: expiry`) shows as expired. |
| Let the result screen finish | The flow stays on screen until the person presses the Continue button on the result screen; the verdict is refreshed from the server when the SDK reports a result. |
| Decide on assurance and verify the token | A verified session counts only when its assurance is in the accepted list. The server verifies the result token. |
| Re-check returning people | Confirm it is you creates a `person.reuse` re-check by `externalRef` when the person is `returningReady`. Otherwise, or on `subject_revoked` or `subject_stale`, the person gets a full verification with a clear message. A face that does not match ends `rejected`: no retry loop. Raise to Identity creates a `step_up`. |
| Handle limits and code refusals | A `429` answers `retryAfterSeconds`; the SDK screens explain refused phone and email codes. |
| Test every outcome | See below. |

A re-check works on any device: the person films a new live capture, and Sekyro AI matches it on the server with the reference portrait stored at their last full verification. Nothing is tied to the device used the first time.

## Exercise every branch in the Sandbox

- **Verified, not verified, review:** the Sandbox's [test identities](https://docs.sekyro.ai/en/getting-started/test-identities)
  force each check's outcome while you run the flow.
- **Any status and reason without the flow:** finish the running session from your server, for example
  `{ "status": "not_verified", "reason": "inconclusive" }`, `{ "status": "not_verified", "reason": "not_opened", "closedBy": "expiry" }`
  (expired), `{ "status": "not_verified", "reason": "cancelled" }`, `{ "status": "not_verified", "reason": "unavailable" }` or
  `{ "status": "review_pending", "then": "decide:approve" }`:

  ```sh
  curl -sS https://api.sekyro.ai/api/v2/sessions/<session id>/simulate \
    -H "Authorization: Bearer $SEKYRO_API_KEY" -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: $(uuidgen)" -d '{ "status": "not_verified", "reason": "rejected" }'
  ```

  The webhook reaches the webhook route, which re-reads the session; the page shows the matching message.
- **A returning person:** verify a demo user once (to `verified`), then press Confirm it is you as the same user: the
  re-check uses the same `externalRef`. Before that first verification, Confirm it is you falls back to a full
  verification with a message.

## Go live

Use a Live key and a Live webhook endpoint, and add your production origin to the app's allowed web origins; see
"Sandbox and Live" at [docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
