import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: ["./app/lib/db/schema.ts", "./app/lib/db/auth-schema.ts"],
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/app.db",
  },
})
