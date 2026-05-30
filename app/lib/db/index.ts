import { drizzle } from "drizzle-orm/d1"
import * as schema from "./schema"
import * as authSchema from "./auth-schema"

// better-auth's drizzle adapter needs a Drizzle instance up-front. With D1
// the binding only exists per-request via env, so we build it on demand.
export const createAuthDb = (binding: D1Database) =>
  drizzle(binding, { schema: { ...schema, ...authSchema } })

export type AuthDb = ReturnType<typeof createAuthDb>
