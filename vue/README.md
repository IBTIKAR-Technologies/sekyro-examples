# Sekyro AI: Vue example

[`<sekyro-verification>`](https://www.npmjs.com/package/@sekyro/elements) from `@sekyro/elements` in a Vite Vue 3
app. The custom element renders every step of the session's flow in the SDK's own screens, in light or dark
(`color-scheme="system"`) and right to left for Arabic. The page shows the SDK's result for display and reads the
verdict that counts from the server.

## Prerequisites

- Node.js 22 or later
- The [`node-express`](../node-express) example running with a Sandbox key, with `http://localhost:5175` in its
  `EXAMPLE_UI_ORIGINS`
- `http://localhost:5175` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web). The SDK calls Sekyro AI from the page, and the API answers only the origins you allow.

## Run

```sh
npm install
cp .env.example .env     # EXAMPLE_SERVER_URL, empty: http://localhost:4000
npm run dev              # http://localhost:5175
```

`npm run dev` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256 (`asset-base-url="/models-v3"`).

Pick a language, click **Start verification**, and follow the screens. What makes the element work in Vue:

- `vite.config.ts`: `isCustomElement: (tag) => tag.startsWith("sekyro-")`, so Vue leaves the tag to the browser.
- `src/main.ts`: `import "@sekyro/elements/define"` registers it, `import "@sekyro/elements/styles.css"` brings its
  styles and fonts, and `import "@sekyro/elements/vue"` types it for `vue-tsc`.
- `src/App.vue`: `:client-token` and `:locale` bind the session; `@sekyro-step`, `@sekyro-result` and `@sekyro-close`
  receive `CustomEvent`s whose `detail` is the step, the result and the close reason.

Checks: `npm run build` (`vue-tsc` and the production bundle). `npm run e2e` runs the production build in Chromium
against a fixture mode that answers the server and Sekyro AI in the page (no key, no phone; install the browser once
with `npx playwright install chromium`).

## Finish with test data

In `npm run dev`, a **Finish with test data** button appears under the flow. It calls `POST /demo/finish/:id` on the
server, which ends the Sandbox session `verified`, and the verdict updates. `src/FinishWithTestData.vue` is loaded
only when `import.meta.env.DEV` is true, so `npm run build` leaves it out. The flow's own **Skip with test data**
action does the same from inside a Sandbox session.

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
