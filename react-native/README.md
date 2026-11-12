# Sekyro AI: React Native example

A bare React Native 0.84 app (New Architecture) that runs the `@sekyro/react-native` drop-in. It asks the
[`node-express`](../node-express) example server for a client token, starts the native verification flow, shows
the step events and the display-only result from the SDK, then polls the server for the verdict.

The API key stays on the server. The app only sees the one-time client token, which it passes to the SDK and never
shows or logs.

## Prerequisites

- Node.js 22.11 or later
- Android: Android Studio with SDK 36 and NDK 27.1, JDK 17
- iOS: Xcode 16 or later and CocoaPods
- The [`node-express`](../node-express) example running with a Sandbox key (`SEKYRO_API_KEY`)

## Run

```sh
npm ci
npm start                 # Metro, leave it running
npm run android           # or, for iOS: (cd ios && pod install) && npm run ios
```

The app talks to the server at `EXAMPLE_SERVER_URL`, read when Metro bundles the JavaScript. Without it, the app uses
`http://10.0.2.2:4000` on the Android emulator (the host machine's loopback) and `http://localhost:4000` on the iOS
simulator. For a phone on your network, start Metro with the server's address and a fresh cache:

```sh
EXAMPLE_SERVER_URL=http://<your computer's LAN address>:4000 npm start -- --reset-cache
```

Debug builds allow plain `http` to a local server: Android through the debug-only `usesCleartextTraffic`
placeholder of the React Native Gradle plugin, iOS through `NSAllowsLocalNetworking`. Use `https` for anything else.

On iOS, `pod install` adds `SekyroKit` from the public `sekyro-ios-dist` podspec at the version that
`@sekyro/react-native` pins. On Android, the native SDK (`ai.sekyro:sekyro-ui`) comes from Maven Central.

Tap **Verify**. The app creates a session, opens the Sekyro flow full screen, lists the step events, and
after the flow closes shows the SDK result and the server's verdict (`GET /sessions/:id`).

Tests: `npm test` (the server client) and `npx tsc --noEmit`.

## Finish with test data

An emulator has no document to scan. In development builds, after a session starts (close the flow if it is open),
tap **Finish with test data**: the app calls `POST /demo/finish/:id` on the server, which ends the Sandbox session
`verified` with test data, and the verdict updates. The server refuses it with a Live key. The button and its call
are only in development builds (`__DEV__`): a release bundle does not contain them.

## Receive the webhook

Webhooks go to the server, not to the app. Forward them to `node-express` with the Sekyro CLI: sign in once
(approve the login in your browser with Sandbox full access), then listen.

```sh
npx @sekyro/cli login
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

See the [`node-express`](../node-express) README for the signing secret. The server logs each verified event and
lists them at `GET /events`.

## How this example is built

Each part follows a rule of [Best practices](https://docs.sekyro.ai/en/getting-started/best-practices).

| Rule | In this example |
|---|---|
| Keep keys on the server | The API key and the webhook secret live only in [`node-express`](../node-express); the page or app gets the session's client token. |
| Pass a stable external reference | The app is signed in as a fixed demo user (`demo-user-1`). Its id is the session's `person.externalRef`. |
| Create the session on click | The app asks for a session only when the person presses Verify or Confirm it is you. |
| Send an idempotency key | Each press makes one `attemptId`; [`node-express`](../node-express) sends it as `X-Idempotency-Key`. |
| Decide on your server | [`node-express`](../node-express) reads the session and decides; the SDK's result is display only. |
| Check, de-duplicate and order webhooks | [`node-express`](../node-express) verifies the signature on the raw body, handles each event `id` once, and re-reads the session instead of trusting the event's status. |
| Handle every outcome | `decide()` has a branch for every status and every `not_verified` reason, with what to show and whether to offer a new session. An expired link (`closedBy: expiry`) shows as expired. |
| Let the result screen finish | The SDK returns the finished result only after the person presses the result button; the app then reads the verdict from the server. |
| Decide on assurance and verify the token | A verified session counts only when its assurance is in the accepted list. The server verifies the result token. |
| Re-check returning people | Confirm it is you asks the server for a `person.reuse` re-check by `externalRef` when the person is `returningReady`. Otherwise, or on `subject_revoked` or `subject_stale`, the person gets a full verification with a clear message. A face that does not match ends `rejected`: no retry loop. |
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

Use a Live key and a Live webhook endpoint on the server; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
