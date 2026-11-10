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

Webhooks go to the server, not to the page. Once the Sekyro CLI (`@sekyro/cli`) is published, forward them to
`node-express` with:

```sh
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

Until then, use a tunnel to the server; see the [`node-express`](../node-express) README.

## Go live

Use a Live key and a Live webhook endpoint on the server, and add your production origin to the app's allowed web
origins; see "Sandbox and Live" at [docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
