# Sekyro AI: Node.js Express example

An Express server on [`@sekyro/node`](https://www.npmjs.com/package/@sekyro/node). It is the server every UI example
in this repository talks to:

| Route | What it does |
|---|---|
| `POST /sessions` | Creates a session (`{ "locale"?: "en" }`) and returns `{ sessionId, clientToken, expiresAt }`. The client token goes to the device that runs the flow, once. |
| `GET /sessions/:id` | The verdict that counts: `status`, `reason`, `closedBy`, `personId`, and for a verified session the claims of the signed result token, checked with `verifyResultToken` against your key's app and environment. |
| `POST /webhooks/sekyro` | Receives webhooks, checks the signature with `verifyWebhook` over the raw body, logs each event. |
| `GET /events` | The last 50 deliveries, newest first, with `signature: "ok"` or why one was refused. |
| `POST /demo/finish/:id` | Ends a Sandbox session `verified` with test data. Refused (`403`) unless the key is a Sandbox key. |

The API key never leaves the server.

## Prerequisites

- Node.js 22 or later
- A Sandbox secret key (dashboard: your app, then API keys)

## Run

```sh
npm install
cp .env.example .env     # then fill in SEKYRO_API_KEY and, once you have one, SEKYRO_WEBHOOK_SECRET
npm run dev              # http://localhost:4000
```

| Variable | |
|---|---|
| `SEKYRO_API_KEY` | Your secret key. A Sandbox key (`sk_test_`) runs in the Sandbox, a Live key in Live. |
| `SEKYRO_WEBHOOK_SECRET` | The signing secret of the webhook endpoint that points at this server. |
| `SEKYRO_FLOW` | Optional: the flow slug or `flw_` id. Empty runs the app's default flow. |
| `EXAMPLE_UI_ORIGINS` | Optional: comma-separated browser origins allowed by CORS (the web examples' dev servers). |
| `PORT` | Optional: default `4000`. |

Create a session:

```sh
curl -X POST localhost:4000/sessions -H 'content-type: application/json' -d '{"locale":"en"}'
```

Run the flow with the client token in one of the UI examples, or keep going with curl below.

Checks: `npm test` (the routes against a fake API: signature refused, finish refused with a Live key) and
`npm run typecheck`.

## Finish with test data

No phone, no document needed:

```sh
curl -X POST localhost:4000/demo/finish/<sessionId>
curl localhost:4000/sessions/<sessionId>     # "status": "verified"
```

The route calls `sekyro.sessions.simulate(id, { status: "verified" })`. Sekyro AI refuses it for a Live key, and this
server refuses it before calling when the key is not a Sandbox key.

## Receive the webhook

Once the Sekyro CLI (`@sekyro/cli`) is published, forward Sandbox webhooks to this server with:

```sh
npx @sekyro/cli listen --forward-to http://localhost:4000/webhooks/sekyro
```

Until then, expose the server through a tunnel of your choice and add `https://<tunnel host>/webhooks/sekyro` as a
Sandbox webhook endpoint in the dashboard (your app, then Webhooks). Put its signing secret in
`SEKYRO_WEBHOOK_SECRET` and restart. After a finish, `GET /events` lists `session.started` and `session.verified`
with `signature: "ok"`.

## Go live

Use a Live key and a Live webhook endpoint; see "Sandbox and Live" at
[docs.sekyro.ai](https://docs.sekyro.ai/en/getting-started/environments).
