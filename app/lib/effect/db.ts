import { Reactivity } from "@effect/experimental"
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { DatabaseConfig } from "~/lib/config/database-config"
import * as appSchema from "~/lib/db/schema"
import * as authSchema from "~/lib/db/auth-schema"

const schema = { ...appSchema, ...authSchema }

const SqlClientLive = Layer.unwrapEffect(
  Effect.map(DatabaseConfig, (cfg) =>
    SqliteClient.layer({ filename: cfg.filename }),
  ),
).pipe(
  Layer.provide(Reactivity.layer),
  Layer.provide(DatabaseConfig.layer),
)

export class Database extends Effect.Service<Database>()("Database", {
  effect: SqliteDrizzle.make({ schema }),
}) {
  static Live = this.Default.pipe(Layer.provideMerge(SqlClientLive))
}
