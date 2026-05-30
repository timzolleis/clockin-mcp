import { D1Client } from "@effect/sql-d1"
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"
import { Context, Effect, Layer } from "effect"
import { CloudflareEnv } from "~/lib/effect/cloudflare-env"
import * as authSchema from "~/lib/db/auth-schema"
import * as schema from "~/lib/db/schema"

// The D1 binding for the current request. Never built at module-load time —
// the binding only exists once a request arrives. `D1BindingLive` derives it
// from the per-request `CloudflareEnv`, so consumers provide the env tag once
// and the binding (plus everything downstream) resolves off it.
export class D1Binding extends Context.Tag("D1Binding")<
  D1Binding,
  D1Database
>() {}

export const D1BindingLive = Layer.effect(
  D1Binding,
  Effect.map(CloudflareEnv, (env) => env.DB),
)

// Idiomatic Effect-SQL layout: SqlClient and the drizzle service are both
// available from the same composed layer. Repositories yield* whichever they
// need — drizzle for typed builders, SqlClient for raw `sql\`\`` templates.
//
// The schema is supplied at runtime (layerWithConfig) purely so better-auth's
// drizzle adapter can resolve its models via `db._.fullSchema`. The Tag's
// static type stays `SqliteRemoteDatabase<Record<string, never>>` regardless,
// so repositories still get query types from the imported table objects
// (e.g. `db.select().from(userToken)`), not from a typed `db.query.*` namespace.
// D1Client.layer's error channel is ConfigError (it can read connection config).
// We pass the binding directly, so a failure here is a server misconfiguration,
// not a client-facing error — orDie it so it never leaks into handler channels.
const SqlClientLive = Layer.unwrapEffect(
  Effect.map(D1Binding, (db) => D1Client.layer({ db })),
).pipe(Layer.orDie)

const DrizzleLive = SqliteDrizzle.layerWithConfig({
  schema: { ...schema, ...authSchema } as unknown as Record<string, never>,
}).pipe(Layer.provide(SqlClientLive))

// The SqlClient + drizzle, with the D1 binding derived from `CloudflareEnv`.
// Its only remaining requirement is `CloudflareEnv` — consumers provide that
// one tag per request and the binding resolves off it.
export const DatabaseLive = Layer.mergeAll(SqlClientLive, DrizzleLive).pipe(
  Layer.provide(D1BindingLive),
)

// Re-export so callers can `import { SqliteDrizzle } from "~/lib/effect/db"`
// without two-step path knowledge.
export { SqliteDrizzle }
