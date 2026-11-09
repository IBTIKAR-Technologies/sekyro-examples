# Sekyro AI: Android Compose example

A Jetpack Compose app that runs the Sekyro Android drop-in (`ai.sekyro:sekyro-ui` from Maven Central, through
`ai.sekyro:sekyro-bom`). It asks the [`node-express`](../node-express) example server for a client token, starts the
verification flow with `Sekyro.start`, shows the step events and the display-only result from the SDK, then polls
the server for the verdict.

The API key stays on the server. The app only sees the one-time client token, which it passes to the SDK and never
shows or logs.

## Prerequisites

- JDK 17
- Android SDK 36 (Android Studio, or `ANDROID_HOME` pointing at the SDK)
- The [`node-express`](../node-express) example running with a Sandbox key (`SEKYRO_API_KEY`)

## Run

```sh
./gradlew :app:installDebug          # an emulator or a phone, then open "Sekyro Example"
```

The app talks to the server at the `EXAMPLE_SERVER_URL` Gradle property, compiled into `BuildConfig`. Without it, the
app uses `http://10.0.2.2:4000`, which is the host machine as the Android emulator sees it. For a phone on your
network:

```sh
./gradlew :app:installDebug -PEXAMPLE_SERVER_URL=http://<your computer's LAN address>:4000
```

Or, for a phone over USB: `adb reverse tcp:4000 tcp:4000` and `-PEXAMPLE_SERVER_URL=http://127.0.0.1:4000`.

Debug builds allow plain `http` to a local server through a debug-only network security config
(`app/src/debug`). Release builds stay HTTPS-only.

To use device attestation, register the package name and your signing certificate digests in the dashboard (Apps →
your app → Integration → Platforms → Android).

Tap **Start verification**. The app creates a session, opens the Sekyro flow, lists the step events, and after the
flow closes shows the SDK result and the server's verdict (`GET /sessions/:id`).

Checks: `./gradlew :app:assembleDebug :app:testDebugUnitTest` (the unit tests cover the server client).

## Finish with test data

An emulator has no document to scan. In debug builds, after a session starts (close the flow if it is open), tap
**Finish with test data**: the app calls `POST /demo/finish/:id` on the server, which ends the Sandbox session
`verified` with test data, and the verdict updates. The server refuses it with a Live key. The button lives in the
`debug` source set (`app/src/debug`); the `release` source set has an empty one, so release builds do not contain it.

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
