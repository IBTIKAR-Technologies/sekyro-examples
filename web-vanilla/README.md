# Sekyro AI: web example without a framework

Every step of a Sekyro flow with [`@sekyro/web`](https://www.npmjs.com/package/@sekyro/web) and plain DOM. The SDK's
step runner (`verification.run()`) hands the page one typed step at a time (`on("step")`); the page renders a small
form or a camera view for it and submits the answer. The verdict that counts comes from the server.

`src/main.ts` covers phone and email codes, the identity method, the ID number, the document and the liveness capture.
For the remaining step kinds it shows a note: the [`react-vite`](../react-vite) example renders every step with
`@sekyro/react`.

## Prerequisites

- Node.js 22 or later
- The [`node-express`](../node-express) example running with a Sandbox key, with `http://localhost:5173` in its
  `EXAMPLE_UI_ORIGINS`
- `http://localhost:5173` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web). The SDK calls Sekyro AI from the page, and the API answers only the origins you allow.

## Run

```sh
npm install
cp .env.example .env     # EXAMPLE_SERVER_URL, default http://localhost:4000
npm run dev              # http://localhost:5173
```

`npm run dev` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256. The SDK never loads them from a CDN; the page
serves them (`assetBaseUrl`, default `/models-v3`).

Click **Start verification**: the page asks the server for a session, runs the flow, and shows the server's verdict
(`GET /sessions/:id`) as it changes.

Checks: `npm run build` (typecheck and production bundle).

## Finish with test data

In `npm run dev`, a **Finish with test data** button appears once a session starts. It calls
`POST /demo/finish/:id` on the server, which ends the Sandbox session `verified`, and the verdict updates. The button
lives in `src/finish.ts`, loaded only when `import.meta.env.DEV` is true, so `npm run build` leaves it out of `dist/`.

## Receive the webhook

Webhooks go to the server, not to the page. Forward them to `node-express` with the Sekyro CLI: sign in once
(approve the login in your browser with Sandbox full access), then listen.

```sh
npx @sekyro/cli login
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

See the [`node-express`](../node-express) README for the signing secret.

## Go live

Use a Live key and a Live webhook endpoint on the server, and add your production origin to the app's allowed web
origins; see "Sandbox and Live" at [docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
