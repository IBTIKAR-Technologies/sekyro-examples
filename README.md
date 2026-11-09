# Sekyro AI sample apps

This repository is published from the Sekyro AI codebase, where the samples are built and tested against each
SDK release. Pull requests here are not merged; for questions or problems, write to support@sekyro.ai.

Small, runnable apps that each take a [Sekyro AI](https://sekyro.ai) Sandbox session from start to a verified result
and a webhook received, with no phone and no document: a **Finish with test data** action ends the session in
development builds.

| Sample | Shows | SDK |
|---|---|---|
| [`node-express`](node-express) | The server every UI sample talks to: create a session, read the verdict, receive and verify webhooks, finish with test data | `@sekyro/node` |
| [`web-vanilla`](web-vanilla) | Every step of a flow with plain DOM, no framework | `@sekyro/web` |
| [`react-vite`](react-vite) | `<SekyroVerification>` in a Vite React app | `@sekyro/react` |
| [`nextjs-app-router`](nextjs-app-router) | Server Action, client component and webhook route handler in one Next.js app (its own server) | `@sekyro/node`, `@sekyro/react` |
| [`react-native`](react-native) | The React Native drop-in (New Architecture) | `@sekyro/react-native` |
| [`flutter`](flutter) | The Flutter drop-in | `sekyro_flutter` |
| [`ios-swiftui`](ios-swiftui) | SekyroKit from SwiftUI | SekyroKit (Swift Package Manager) |
| [`android-compose`](android-compose) | The Android drop-in from Jetpack Compose | `ai.sekyro` (Maven Central) |

Every sample pins a published SDK version and builds on its own: copy its folder anywhere and follow its README.

## Before you start

1. Sign up at [sekyro.ai](https://sekyro.ai). New apps start in the Sandbox.
2. Create a Sandbox secret key (dashboard: your app, then API keys). It goes into the server's environment only,
   never into a page or an app.
3. Run [`node-express`](node-express) (or [`nextjs-app-router`](nextjs-app-router), which has its own server).
4. For the web samples, add their dev origin to your app's allowed web origins (dashboard: your app, then
   Integration, then Platforms, then Web).

## The webhook step

Webhooks go to your server. Once the Sekyro CLI (`@sekyro/cli`) is published:

```sh
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

Until then, expose the server through a tunnel of your choice and add the tunnel URL as a Sandbox webhook endpoint
in the dashboard (your app, then Webhooks); each sample's README shows the path.

## Going live

A Live key and a Live webhook endpoint, nothing else in the code changes. See "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).

## License

The samples are under the MIT license (`LICENSE`). The Sekyro AI SDKs they install have their own license, named in
each package.
