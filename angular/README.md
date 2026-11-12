# Sekyro AI: Angular example

[`<sekyro-verification>`](https://www.npmjs.com/package/@sekyro/elements) from `@sekyro/elements` in an Angular app
with standalone components (zoneless, signals). The custom element renders every step of the session's flow in the
SDK's own screens, in light or dark (`color-scheme="system"`) and right to left for Arabic. The page shows the SDK's
result for display and reads the verdict that counts from the server. The app also loads an Angular Material theme,
to show that the flow keeps its own look under it.

## Prerequisites

- Node.js 22 or later
- The [`node-express`](../node-express) example running with a Sandbox key, with `http://localhost:4200` in its
  `EXAMPLE_UI_ORIGINS`
- `http://localhost:4200` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web). The SDK calls Sekyro AI from the page, and the API answers only the origins you allow.

## Run

```sh
npm install
cp .env.example .env     # EXAMPLE_SERVER_URL, empty: http://localhost:4000
npm start                # http://localhost:4200
```

`npm start` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256 (`asset-base-url="/models-v3"`). Both pass
`EXAMPLE_SERVER_URL` to the Angular CLI as a build-time constant (`scripts/ng.mjs`).

Pick a language, click **Start verification**, and follow the screens. What makes the element work in Angular:

- `src/app/app.component.ts`: `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, so Angular accepts the tag; `[clientToken]` and
  `[locale]` bind the session as properties; `(sekyro-step)`, `(sekyro-result)` and `(sekyro-close)` receive
  `CustomEvent`s whose `detail` is the step, the result and the close reason.
- `src/main.ts`: `import "@sekyro/elements/define"` registers the element.
- `angular.json`: `node_modules/@sekyro/elements/dist/styles.css` in `styles`; the builder emits the fonts it names.

Checks: `npm run build` (templates type-checked, production bundle). `npm run e2e` runs the production build in
Chromium against a fixture mode that answers the server and Sekyro AI in the page (no key, no phone; install the
browser once with `npx playwright install chromium`).

## Finish with test data

In `npm start` (a development build), a **Finish with test data** button appears under the flow. It calls
`POST /demo/finish/:id` on the server, which ends the Sandbox session `verified`, and the verdict updates.
`src/app/finish-with-test-data.component.ts` is imported only when `ngDevMode` is on, so `npm run build` leaves it
out. The flow's own **Skip with test data** action does the same from inside a Sandbox session.

## Receive the webhook

Webhooks go to the server, not to the page. Forward them to `node-express` with the Sekyro CLI: sign in once
(approve the login in your browser with Sandbox full access), then listen.

```sh
npx @sekyro/cli login
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

See the [`node-express`](../node-express) README for the signing secret.

## How this example is built

Each part follows a rule of [Best practices](https://docs.sekyro.ai/en/getting-started/best-practices).

| Rule | In this example |
|---|---|
| Keep keys on the server | The API key and the webhook secret live only in [`node-express`](../node-express); the page or app gets the session's client token. |
| Pass a stable external reference | "Signed in as" picks a fixed demo user. Its id is the session's `person.externalRef`. |
| Create the session on click | The page asks for a session only when the person presses Start verification or Confirm it is you. |
| Send an idempotency key | Each press makes one `attemptId`; [`node-express`](../node-express) sends it as `X-Idempotency-Key`. |
| Decide on your server | [`node-express`](../node-express) reads the session and decides; the SDK's result is display only. |
| Check, de-duplicate and order webhooks | [`node-express`](../node-express) verifies the signature on the raw body, handles each event `id` once, and re-reads the session instead of trusting the event's status. |
| Handle every outcome | `decide()` has a branch for every status and every `not_verified` reason, with what to show and whether to offer a new session. An expired link (`closedBy: expiry`) shows as expired. |
| Let the result screen finish | The flow stays on screen until the person presses the Continue button on the result screen; the verdict is refreshed from the server when the SDK reports a result. |
| Decide on assurance and verify the token | A verified session counts only when its assurance is in the accepted list. The server verifies the result token. |
| Re-check returning people | Confirm it is you creates a `person.reuse` re-check by `externalRef` when the person is `returningReady`. Otherwise, or on `subject_revoked` or `subject_stale`, the person gets a full verification with a clear message. A face that does not match ends `rejected`: no retry loop. |
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

  The webhook reaches the server, which re-reads the session; the page shows the matching message.
- **A returning person:** verify a demo user once (to `verified`), then press Confirm it is you as the same user: the
  re-check uses the same `externalRef`. Before that first verification, Confirm it is you falls back to a full
  verification with a message.

## Go live

Use a Live key and a Live webhook endpoint on the server, and add your production origin to the app's allowed web
origins; see "Sandbox and Live" at [docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
