import { defineConfig } from "drizzle-kit"

// Schema-only config: `drizzle-kit generate` produces SQL migrations that
// `wrangler d1 migrations apply` runs against D1. We don't push from drizzle
// directly because the live database is D1 (HTTP-bound, no driver URL).
export default defineConfig({
  schema: ["./app/lib/db/schema.ts", "./app/lib/db/auth-schema.ts"],
  out: "./db/migrations",
  dialect: "sqlite",
  driver: "d1-http",
})
