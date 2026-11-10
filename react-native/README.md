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

Tap **Start verification**. The app creates a session, opens the Sekyro flow full screen, lists the step events, and
after the flow closes shows the SDK result and the server's verdict (`GET /sessions/:id`).

Tests: `npm test` (the server client) and `npx tsc --noEmit`.

## Finish with test data

An emulator has no document to scan. In development builds, after a session starts (close the flow if it is open),
tap **Finish with test data**: the app calls `POST /demo/finish/:id` on the server, which ends the Sandbox session
`verified` with test data, and the verdict updates. The server refuses it with a Live key. The button and its call
are only in development builds (`__DEV__`): a release bundle does not contain them.

## Receive the webhook

Webhooks go to the server, not to the app. Forward them to `node-express` with the Sekyro CLI:

```sh
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

See the [`node-express`](../node-express) README for the signing secret. The server logs each verified event and
lists them at `GET /events`.

## Go live

Use a Live key and a Live webhook endpoint on the server; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
