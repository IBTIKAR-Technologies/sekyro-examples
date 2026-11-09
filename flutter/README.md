# Sekyro AI: Flutter example

A Flutter app that runs the `sekyro_flutter` drop-in. It asks the [`node-express`](../node-express) example server
for a client token, starts the native verification flow, shows the step events and the display-only result from the
SDK, then polls the server for the verdict.

The API key stays on the server. The app only sees the one-time client token, which it passes to the SDK and never
shows or logs.

## Prerequisites

- Flutter 3.27 or later (Dart 3.6 or later)
- Android: Android SDK 36 and JDK 17
- iOS: Xcode 16 or later and CocoaPods
- The [`node-express`](../node-express) example running with a Sandbox key (`SEKYRO_API_KEY`)

## Run

```sh
flutter pub get
flutter run                                   # an Android emulator or an iOS simulator
```

The app talks to the server at `EXAMPLE_SERVER_URL`, a compile-time value. Without it, the app uses
`http://10.0.2.2:4000` on the Android emulator (the host machine's loopback) and `http://localhost:4000` on the iOS
simulator. For a phone on your network:

```sh
flutter run --dart-define=EXAMPLE_SERVER_URL=http://<your computer's LAN address>:4000
```

Debug builds allow plain `http` to a local server: Android through a debug-only network security config
(`android/app/src/debug`), iOS through `NSAllowsLocalNetworking`. Use `https` for anything else.

The native SDKs come from their public releases: `ai.sekyro:sekyro-ui` from Maven Central, and `SekyroKit` from the
public `sekyro-ios-dist` podspec named in `ios/Podfile` (`pod install` runs with `flutter run`). To read document
chips on an iPhone, add the Near Field Communication Tag Reading capability to the Runner target.

Tap **Start verification**. The app creates a session, opens the Sekyro flow full screen, lists the step events, and
after the flow closes shows the SDK result and the server's verdict (`GET /sessions/:id`).

Checks: `flutter analyze`, `flutter test` (the server client) and `flutter build apk --debug`.

## Finish with test data

An emulator has no document to scan. In debug builds, after a session starts (close the flow if it is open), tap
**Finish with test data**: the app calls `POST /demo/finish/:id` on the server, which ends the Sandbox session
`verified` with test data, and the verdict updates. The server refuses it with a Live key. The button is built under
`kDebugMode`, so profile and release builds do not contain it.

## Receive the webhook

Webhooks go to the server, not to the app. Once the Sekyro CLI (`@sekyro/cli`) is published, forward them to
`node-express` with:

```sh
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

Until then, expose the server through a tunnel of your choice and add `https://<tunnel host>/webhooks/sekyro` as a
webhook endpoint of your Sandbox key in the dashboard. The server logs each verified event and lists them at
`GET /events`.

## Go live

Use a Live key and a Live webhook endpoint on the server; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
