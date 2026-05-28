import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { Config, Effect } from "effect"
import * as schema from "./schema"
import * as authSchema from "./auth-schema"

// better-auth's drizzle adapter needs a synchronous instance; the Effect-native
// SqliteDrizzle service lives in ~/lib/effect/db.ts and is used by everything
// else. Bridge: read DATABASE_URL via Effect.runSync.
const filename = Effect.runSync(Config.string("DATABASE_URL"))

const sqlite = new Database(filename)
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } })
