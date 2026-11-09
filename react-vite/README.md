# Sekyro AI: React (Vite) example

[`<SekyroVerification>`](https://www.npmjs.com/package/@sekyro/react) from `@sekyro/react/verification` in a Vite
React app. The component renders every step of the session's flow in the SDK's own screens, in light or dark
(`colorScheme="system"`) and right to left for Arabic. The page shows the SDK's result for display and reads the
verdict that counts from the server.

## Prerequisites

- Node.js 22 or later
- The [`node-express`](../node-express) example running with a Sandbox key, with `http://localhost:5174` in its
  `EXAMPLE_UI_ORIGINS`
- `http://localhost:5174` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web). The SDK calls Sekyro AI from the page, and the API answers only the origins you allow.

## Run

```sh
npm install
cp .env.example .env     # EXAMPLE_SERVER_URL, default http://localhost:4000
npm run dev              # http://localhost:5174
```

`npm run dev` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256 (`assetBaseUrl="/models-v3"`).

Pick a language, click **Start verification**, and follow the screens. `src/main.tsx` imports
`@sekyro/react/styles.css` and `@sekyro/react/verification.css` once.

Checks: `npm run build` (typecheck and production bundle).

## Finish with test data

In `npm run dev`, a **Finish with test data** button appears under the flow. It calls `POST /demo/finish/:id` on the
server, which ends the Sandbox session `verified`, and the verdict updates. `src/FinishWithTestData.tsx` is loaded
lazily only when `import.meta.env.DEV` is true, so `npm run build` leaves it out.

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
