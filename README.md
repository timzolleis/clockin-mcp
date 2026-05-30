# clockin-mcp

Control your [Clockin](https://www.clockin.de/) workday from any MCP client.

`clockin-mcp` is a self-hostable, multi-user MCP server that bridges the
[Model Context Protocol](https://modelcontextprotocol.io) to the Clockin mobile
API. You sign up, connect your Clockin account once, then point Claude Desktop
(or any MCP client) at the server over OAuth 2.1 — and clock in, switch
projects, take breaks, and check your time balance by just asking.

> "Clock me in." · "What am I working on right now?" · "Switch me to the
> Acme project." · "How many hours do I still need this week?"

## Tools

| Tool | What it does |
| --- | --- |
| `current_status` | What am I doing right now? State, since-when, and active project. |
| `clock_in` | Start the workday. |
| `clock_out` | End the workday. |
| `start_break` | Begin a break — time stops counting as work. |
| `resume_work` | Return from a break to general work time. |
| `start_project_work` | Switch to a specific project (`project_id` from `list_projects`). |
| `clock_in_to_project` | Clock in (if needed) **and** switch to a project in one step — opens the workday first when you're clocked out. |
| `list_projects` | List projects, optionally filtered by a search query. |
| `list_workdays` | Recent days rolled up with per-segment and per-project durations. |
| `time_overview` | Week/month worked vs. target hours, flextime, and vacation balance. |

## How it works

1. **Sign up** for an account on your deployment and **connect Clockin** at
   `/settings`. You enter your Clockin email + password once; the server logs in
   on your behalf and stores the returned tokens **encrypted at rest
   (AES-256-GCM)**. Your password is never persisted.
2. **Connect an MCP client.** The client discovers the server's OAuth metadata,
   you sign in and grant consent, and it receives a JWT bearer token.
3. **Call tools.** Each tool invocation is authenticated by your JWT, loads and
   decrypts your Clockin tokens, and proxies the call to the Clockin API as you.

```
MCP client ──OAuth 2.1──▶ clockin-mcp ──user tokens──▶ Clockin API
 (Claude Desktop)          (this app)                  (mobile.clockin.de)
```

## Stack

- **[Cloudflare Workers](https://workers.cloudflare.com/)** + **[D1](https://developers.cloudflare.com/d1/)** (SQLite) — runtime and storage
- **[React Router 7](https://reactrouter.com/)** (framework mode) — web UI + routing
- **[better-auth](https://www.better-auth.com/)** + [`@better-auth/oauth-provider`](https://www.npmjs.com/package/@better-auth/oauth-provider) — OAuth 2.1 provider for MCP (JWT)
- **[Effect](https://effect.website/)** — the entire upstream client and service layer
- **[`mcp-handler`](https://www.npmjs.com/package/mcp-handler)** + **[`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)** — MCP transport
- **AES-256-GCM** token-at-rest encryption

## Self-hosting

Deploys to Cloudflare Workers. You'll need a Cloudflare account and
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/).

```sh
pnpm install

# Create the D1 database, then put its id into wrangler.jsonc
wrangler d1 create clockin-mcp

# Apply migrations to the remote database
pnpm db:migrate:remote

# Set production secrets
wrangler secret put BETTER_AUTH_SECRET      # openssl rand -base64 32
wrangler secret put TOKEN_ENCRYPTION_KEY    # openssl rand -base64 32
# (BETTER_AUTH_URL is set in wrangler.jsonc `vars` to your public URL)

pnpm deploy
```

### Configuration

| Var | Where | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | secret | Signs sessions/JWTs. `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | secret | 32 bytes, base64. Encrypts stored Clockin tokens. **Treat as permanent** — rotating it invalidates every stored credential. |
| `BETTER_AUTH_URL` | var | Public base URL (e.g. `https://clockin-mcp.example.workers.dev`). |
| `CLOCKIN_BASE_URL` | var (optional) | Upstream API base. Defaults to `https://mobile.clockin.de/v2`. |
| `DB` | binding | D1 database binding, configured in `wrangler.jsonc`. |

## Local development

```sh
pnpm install

# Local secrets go in .dev.vars (gitignored):
#   BETTER_AUTH_SECRET=...      (openssl rand -base64 32)
#   TOKEN_ENCRYPTION_KEY=...    (openssl rand -base64 32)

# Apply migrations to the local D1 database
pnpm db:migrate:local

pnpm dev
```

Open <http://localhost:5173>, sign up at `/sign-up`, and connect your Clockin
account at `/settings`.

## Connecting an MCP client

The MCP endpoint is `${BETTER_AUTH_URL}/mcp` (streamable HTTP). A legacy
`/sse` transport is also mounted. Clients discover OAuth automatically via:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server/api/auth`

Test with the inspector:

```sh
npx @modelcontextprotocol/inspector
# point it at http://localhost:5173/mcp
```

The inspector dynamically registers a client, redirects you through sign-in and
the `/consent` screen, then calls tools with a JWT bearer.

You can review and revoke connected clients at any time from `/settings`;
revoking deletes their tokens and access immediately.

## Project layout

```
app/
  routes/
    home.tsx, sign-in.tsx, sign-up.tsx, consent.tsx
    settings.tsx              connect Clockin · manage connected clients
    api.auth.ts               mounts the better-auth handler
    api.mcp.ts                MCP endpoint (/mcp, /sse, /message)
    api.v1.$.ts               internal JSON API used by the SPA
    well-known/               OAuth + OIDC discovery documents
  features/
    clockin/                  layered Clockin integration:
      client/                 authenticated HTTP clients (device/user token) + typed errors
      api/                    one thin service per upstream resource (HTTP + decode)
      service/                business services on top (intent + derived views)
      credentials/            encrypted Clockin token storage
      router/                 internal v1 API group + per-request service wiring
    connections/              list/revoke connected MCP clients
  lib/
    mcp.server.ts             MCP tool registration (the table above)
    auth.ts                   better-auth server instance
    config/                   Clockin + token-encryption config
    domain/                   schemas: workday, status, project, timesheet, ...
    effect/                   runtime, D1 layer, AES-256-GCM vault
    db/                       drizzle schema + better-auth schema
workers/app.ts                Worker entry
db/                           drizzle config + D1 migrations
wrangler.jsonc                Cloudflare config (D1 binding, vars)
```

## Adding new MCP tools

Tools are registered in `app/lib/mcp.server.ts` inside `registerTools`. Each is
a thin wrapper around an Effect from a business service in
`app/features/clockin/service/*`:

```ts
server.registerTool(
  "my_tool",
  { description: "...", inputSchema: { /* zod */ } },
  (args) => run(Effect.flatMap(SomeClockinService, (s) => s.doThing(args))),
)
```

`run` threads in the user's decrypted credentials, renders any error to text,
and executes on the per-request Effect runtime. The Clockin integration is
layered — add code at the level that fits:

- **`client/`** — only when adding a new transport concern (a token tier, a
  shared header). Most changes don't touch this.
- **`api/`** — to call a new upstream endpoint: add a method to the relevant
  `*-api.ts` service (thin HTTP + schema decode + error narrowing).
- **`service/`** — for intent or derivation (payload building, multi-call
  orchestration, client-side rollups) composed on top of the `api/` layer.

New services are wired into the graph in
`app/features/clockin/router/request-services.server.ts`.

## Regenerating DB schema

After changing better-auth plugins in `app/lib/auth.ts`:

```sh
pnpm auth:generate   # regenerates app/lib/db/auth-schema.ts
pnpm db:generate     # generates a new D1 migration
pnpm db:migrate:local
```
