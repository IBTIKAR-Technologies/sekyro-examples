# Sekyro AI: iOS SwiftUI example

A SwiftUI app that runs the SekyroKit drop-in (`SekyroFlowView`). It asks the [`node-express`](../node-express)
example server for a client token, presents the verification flow full screen, shows the step events and the
display-only result from the SDK, then polls the server for the verdict.

The API key stays on the server. The app only sees the one-time client token, which it passes to the SDK and never
shows or logs.

## Prerequisites

- Xcode 16 or later (iOS 15 deployment target)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- The [`node-express`](../node-express) example running with a Sandbox key (`SEKYRO_API_KEY`)

SekyroKit comes from Swift Package Manager: `https://github.com/IBTIKAR-Technologies/sekyro-ios-dist`, exact version
`0.1.0-rc.18` (see `project.yml`).

## Run

```sh
xcodegen
open Example.xcodeproj        # run the Example scheme on a simulator
```

The app talks to the server at the `EXAMPLE_SERVER_URL` build setting (Info.plist key `ExampleServerURL`), default
`http://localhost:4000`, which is your Mac as the simulator sees it. For a phone on your network, set it in
`project.yml` or on the command line:

```sh
xcodebuild -scheme Example -destination 'platform=iOS Simulator,name=<simulator>' EXAMPLE_SERVER_URL=http://<your Mac's LAN address>:4000 build
```

Debug builds allow plain `http` to a local server: a build phase adds `NSAllowsLocalNetworking` to the built
Info.plist of Debug builds only. Release builds keep strict App Transport Security.

To run on a device, set your own `PRODUCT_BUNDLE_IDENTIFIER` and `DEVELOPMENT_TEAM` and register the bundle ID in the
dashboard (Apps → your app → Integration → Platforms → iOS). `Example.entitlements` enables App Attest (development)
and NFC tag reading for document chips.

Tap **Start verification**. The app creates a session, presents the Sekyro flow, lists the step events, and after the
flow closes shows the SDK result and the server's verdict (`GET /sessions/:id`).

Tests (the server client), on a simulator:

```sh
xcodebuild -scheme Example -destination 'platform=iOS Simulator,name=<simulator>' test
```

## Finish with test data

A simulator has no camera. In Debug builds, after a session starts (close the flow if it is open), tap **Finish with
test data**: the app calls `POST /demo/finish/:id` on the server, which ends the Sandbox session `verified` with test
data, and the verdict updates. The server refuses it with a Live key. `FinishWithTestData.swift` is compiled only
under `#if DEBUG`, so Release builds do not contain it.

## Receive the webhook

Webhooks go to the server, not to the app. Forward them to `node-express` with the Sekyro CLI: sign in once
(approve the login in your browser with Sandbox full access), then listen.

```sh
npx @sekyro/cli login
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

See the [`node-express`](../node-express) README for the signing secret. The server logs each verified event and
lists them at `GET /events`.

## Go live

Use a Live key and a Live webhook endpoint on the server; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
