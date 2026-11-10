# Sekyro AI: Next.js App Router example

The three pieces of a Sekyro integration in one Next.js app:

| Piece | File |
|---|---|
| A Server Action creates the session with [`@sekyro/node`](https://www.npmjs.com/package/@sekyro/node) and reads the verdict | `app/actions.ts` |
| A client component runs the flow with `<SekyroVerification>` from [`@sekyro/react`](https://www.npmjs.com/package/@sekyro/react) | `app/verification.tsx` |
| A route handler receives the webhook on the Node runtime and checks its signature over the raw body | `app/api/webhooks/sekyro/route.ts` |

The secret key stays on the server (`lib/sekyro.ts` imports `server-only`). The page itself is a Server Component that
renders the shell; `@sekyro/react` ships its components as client components, so they render in a client boundary
without extra setup.

## Prerequisites

- Node.js 22 or later
- A Sandbox secret key (dashboard: your app, then API keys)
- `http://localhost:3000` in your app's allowed web origins (dashboard: your app, then Integration, then Platforms,
  then Web)

## Run

```sh
npm install
cp .env.example .env.local     # then fill in SEKYRO_API_KEY and, once you have one, SEKYRO_WEBHOOK_SECRET
npm run dev                    # http://localhost:3000
```

`npm run dev` and `npm run build` first run `npm run models`, which copies the face detector assets into
`public/models-v3` and checks each file against its pinned sha256 (`assetBaseUrl="/models-v3"`).

Pick a language, click **Start verification**, and follow the screens. The page shows the server's verdict and the
webhooks this app received for the session.

Checks: `npm run build` and `npm run typecheck`.

## Finish with test data

In `npm run dev`, a **Finish with test data** button appears once a session starts. It calls the
`finishWithTestData` Server Action, which ends the Sandbox session `verified` with
`sekyro.test.sessions.simulate(id, { status: "verified" })`. The action refuses outside `next dev` and with a Live key,
and a production build does not render the button.

## Receive the webhook

Forward Sandbox webhooks to the route handler with the Sekyro CLI, in a second terminal:

```sh
npx @sekyro/cli listen --forward-to http://localhost:3000/api/webhooks/sekyro
```

It reads `SEKYRO_API_KEY` from the environment (Sandbox keys only) and prints the signing secret of its forwarding
endpoint: put it in `SEKYRO_WEBHOOK_SECRET` and restart. Pass `--keep` to keep the same endpoint and secret between
runs. After a finish, the page lists `session.started` and
`session.verified` with `signature: "ok"`. The list lives in memory (`lib/events.ts`); a real app stores deliveries
and de-duplicates them on the envelope `id`.

## Go live

Use a Live key and a Live webhook endpoint, and add your production origin to the app's allowed web origins; see
"Sandbox and Live" at [docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
