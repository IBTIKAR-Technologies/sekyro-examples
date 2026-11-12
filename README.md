# Sekyro AI sample apps

Small, runnable apps that each take a [Sekyro AI](https://sekyro.ai) Sandbox session from start to a verified result
and a webhook received, with no phone and no document: a **Finish with test data** action ends the session in
development builds.

| Sample | Shows | SDK |
|---|---|---|
| [`node-express`](node-express) | The server every UI sample talks to: create a session, read the verdict, receive and verify webhooks, finish with test data | `@sekyro/node` |
| [`web-vanilla`](web-vanilla) | Every step of a flow with plain DOM, no framework | `@sekyro/web` |
| [`react-vite`](react-vite) | `<SekyroVerification>` in a Vite React app | `@sekyro/react` |
| [`vue`](vue) | `<sekyro-verification>` in a Vite Vue 3 app | `@sekyro/elements` |
| [`angular`](angular) | `<sekyro-verification>` in an Angular app (standalone components) | `@sekyro/elements` |
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

Webhooks go to your server. The Sekyro CLI forwards your Sandbox webhooks to it with their real signature, no
tunnel needed. Sign in once: the command opens your browser, where you approve the login with Sandbox full access,
and keeps an access token on your machine.

```sh
npx @sekyro/cli login
```

Then forward the webhooks to your server's webhook route:

```sh
npx @sekyro/cli listen --forward-to <url>
```

It prints the signing secret your server verifies with; each sample's README gives `<url>` and where the secret
goes. `npx @sekyro/cli trigger session.verified` sends a sample of any event.

## How the samples are built

Every sample follows the integration rules of [Best practices](https://docs.sekyro.ai/en/getting-started/best-practices), with the shared logic in the servers
([`node-express`](node-express) and [`nextjs-app-router`](nextjs-app-router)) and thin clients:

- the keys stay on the server, and a fixed demo user gives every session a stable `externalRef`;
- a session is created only when the person presses Verify or Confirm it is you, with one idempotency key per press;
- every create sends `resumeOpen: true` with the person key, so a reload or a second press gets the person's open session
  back (`resumed: true`, with its existing client token) instead of a new one;
- the server decides every status and reason (`decide()`), from the webhook (signature checked, each event id handled
  once, the session re-read) and its own reads, and keeps each demo user's person id and state in memory;
- the flow stays on screen until the person presses the result screen's button ("Continue" in the web SDKs; the native SDKs show it from their next release);
- a verified session counts only with an accepted assurance, and the result token is verified on the server;
- Confirm it is you re-checks a returning person with `person.reuse` when they are `returningReady`, and falls back to
  a full verification otherwise. A re-check works on any device: a new live capture is matched on the server with the
  portrait stored at the last full verification. `node-express` with `react-vite`, and `nextjs-app-router`, also show
  Raise to Identity (`step_up`);
- each README says how to reach every branch in the Sandbox.

## Going live

A Live key and a Live webhook endpoint, nothing else in the code changes. See "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).

## License

The samples are under the MIT license (`LICENSE`). The Sekyro AI SDKs they install have their own license, named in
each package.

Questions or problems: support@sekyro.ai.
