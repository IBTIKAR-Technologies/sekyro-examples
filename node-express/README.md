# Sekyro AI: Node.js Express example

An Express server on [`@sekyro/node`](https://www.npmjs.com/package/@sekyro/node). It is the server every UI example
in this repository talks to:

| Route | What it does |
|---|---|
| `POST /sessions` | Creates a session (`{ "userId"?: "demo-user-1", "locale"?: "en", "externalRef"?: "<your user id>" }`). A demo `userId` becomes the `externalRef`. `externalRef` goes to Sekyro AI as `person.externalRef`, your own id for the person, which a flow can require; without it the sample sends a random id standing in for your user id (pass your own user id in your app) and returns `{ sessionId, clientToken, expiresAt }`. The client token goes to the device that runs the flow, once. |
| | Call it when the person clicks Start, never on render. Send an `attemptId` made once per click (8 to 100 letters, digits, `_` or `-`) and send it again when you retry after a network error: it is the idempotency key, so the retry returns the same session. A `429` answers `{ error, retryAfterSeconds }`. |
| `GET /users`, `GET /users/:id` | The fixed demo users, and one user's stored state: Sekyro AI person id, latest session, status, reason and decision (written by the webhook and by this server's reads), plus `returningReady`, `level` and `assurance` from `GET /people?externalRef=`. |
| `POST /sessions/recheck` | "Confirm it is you" (`{ "userId": "demo-user-1" }` or `{ "externalRef": "<your user id>" }`): liveness and a face match against the portrait stored at the person's last full verification, on any device. A person who is not `returningReady`, or a create refused with `subject_not_found`, `subject_no_reference`, `subject_stale`, `reuse_disabled` or `subject_revoked`, answers `409` with `next: "full_verification"` and a `message`. |
| `POST /sessions/step-up` | "Raise to Identity": a `step_up` on `SEKYRO_STEP_UP_FLOW` (default `identity`), same body and same fallback. |
| `GET /sessions/:id` | The verdict that counts: `status`, `reason`, `closedBy`, `personId`, and for a verified session the claims of the signed result token, checked with `verifyResultToken` against your key's app and environment. `decision` says what to do: `access`, what to `show`, and `canRetry` for a new session, for every status and reason (`src/decide.ts`, with the accepted assurance list). |
| `POST /webhooks/sekyro` | Receives webhooks, checks the signature with `verifyWebhook` over the raw body, logs each event. |
| `GET /events` | The last 50 deliveries, newest first, with `signature: "ok"` or why one was refused. |
| `POST /demo/finish/:id` | Ends a Sandbox session `verified` with test data. Refused (`403`) unless the key is a Sandbox key. |

The API key never leaves the server.

## Prerequisites

- Node.js 22 or later
- A Sandbox secret key (dashboard: your app, then API keys)

## Run

```sh
npm install
cp .env.example .env     # then fill in SEKYRO_API_KEY and, once you have one, SEKYRO_WEBHOOK_SECRET
npm run dev              # http://localhost:4000
```

| Variable | |
|---|---|
| `SEKYRO_API_KEY` | Your secret key. A Sandbox key (`sk_test_`) runs in the Sandbox, a Live key in Live. |
| `SEKYRO_WEBHOOK_SECRET` | The signing secret of the webhook endpoint that points at this server. Without it the server starts with `POST /webhooks/sekyro` off. |
| `SEKYRO_API_BASE_URL` | Optional: the API your server calls, for example `https://api-staging.sekyro.ai/api/v2`. Empty calls `https://api.sekyro.ai/api/v2`. `sekyro init` sets it when the CLI targets another API. |
| `SEKYRO_FLOW` | Optional: the flow slug or `flw_` id. Empty runs the app's default flow. |
| `EXAMPLE_UI_ORIGINS` | Optional: comma-separated browser origins allowed by CORS (the web examples' dev servers). |
| `PORT` | Optional: default `4000`. |

Create a session:

```sh
curl -X POST localhost:4000/sessions -H 'content-type: application/json' -d '{"locale":"en"}'
```

Run the flow with the client token in one of the UI examples, or keep going with curl below.

Checks: `npm test` (the routes against a fake API: signature refused, finish refused with a Live key) and
`npm run typecheck`.

## Finish with test data

No phone, no document needed:

```sh
curl -X POST localhost:4000/demo/finish/<sessionId>
curl localhost:4000/sessions/<sessionId>     # "status": "verified"
```

The route calls `sekyro.test.sessions.simulate(id, { status: "verified" })`. Sekyro AI refuses it for a Live key, and this
server refuses it before calling when the key is not a Sandbox key.

## Receive the webhook

Forward Sandbox webhooks to this server with the Sekyro CLI. Sign in once: the command opens your browser, where
you approve the login with Sandbox full access, and keeps an access token on your machine.

```sh
npx @sekyro/cli login
```

Then, in a second terminal:

```sh
npm run dev:webhooks     # sekyro listen --forward-to http://localhost:4000/webhooks/sekyro
```

It prints the signing secret of its forwarding endpoint. Put that secret in `SEKYRO_WEBHOOK_SECRET` and restart the
server. Pass `--keep` (`npm run dev:webhooks -- --keep`) to keep the same endpoint and secret between runs. After a
finish, `GET /events` lists `session.started` and `session.verified` with `signature: "ok"`. To send a sample of any
event: `npx sekyro trigger session.verified`.

## How this example is built

Each part follows a rule of [Best practices](https://docs.sekyro.ai/en/getting-started/best-practices).

| Rule | In this example |
|---|---|
| Keep keys on the server | The API key and the webhook secret live only in this server's environment; the page or app gets the session's client token. |
| Pass a stable external reference | "Signed in as" picks a fixed demo user. Its id is the session's `person.externalRef`. |
| Create the session on click | The UI sample asks for a session only when the person presses Verify or Confirm it is you. |
| Resume the open session | Every create sends `resumeOpen: true` with the person key, so a reload or a second click gets the open session back (`resumed: true`, the same client token). |
| Send an idempotency key | Each press makes one `attemptId`; The server sends it as `X-Idempotency-Key`. |
| Decide on your server | The server reads the session and decides; the SDK's result is display only. |
| Check, de-duplicate and order webhooks | The server verifies the signature on the raw body, handles each event `id` once, and re-reads the session instead of trusting the event's status. |
| Handle every outcome | `decide()` has a branch for every status and every `not_verified` reason, with what to show and whether to offer a new session. An expired link (`closedBy: expiry`) shows as expired. |
| Let the result screen finish | The flow stays on screen until the person presses the result button; the verdict is refreshed from the server when the SDK reports a result. |
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

  The webhook reaches this server, which re-reads the session; the page shows the matching message.
- **A returning person:** verify a demo user once (to `verified`), then press Confirm it is you as the same user: the
  re-check uses the same `externalRef`. Before that first verification, Confirm it is you falls back to a full
  verification with a message.

## Go live

Use a Live key and a Live webhook endpoint; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
