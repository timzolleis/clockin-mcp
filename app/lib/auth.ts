import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { jwt } from "better-auth/plugins"
import { oauthProvider } from "@better-auth/oauth-provider"
import { Config, Effect, Redacted } from "effect"
import { db } from "~/lib/db"

// better-auth is not Effect-native — bridge: read env via Effect.runSync.
const baseURL = Effect.runSync(Config.string("BETTER_AUTH_URL"))
const secret = Effect.runSync(
  Config.redacted("BETTER_AUTH_SECRET").pipe(Effect.map(Redacted.value)),
)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  baseURL,
  secret,
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // MCP resource — token requests use `resource=${baseURL}/mcp`; without
      // this list the server rejects with "requested resource invalid".
      validAudiences: [`${baseURL}/mcp`],
    }),
  ],
})
