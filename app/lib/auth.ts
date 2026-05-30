import { oauthProvider } from "@better-auth/oauth-provider"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { jwt } from "better-auth/plugins"
import { Context, Effect, Layer, Redacted } from "effect"
import { CloudflareEnv } from "~/lib/effect/cloudflare-env"
import { DatabaseLive, SqliteDrizzle } from "~/lib/effect/db"

export class AuthConfig extends Context.Tag("AuthConfig")<
  AuthConfig,
  {
    secret: Redacted.Redacted
    url: string
  }
>() {}

// Derived from the per-request `CloudflareEnv` rather than `Config.*` — keeps
// `Redacted` masking for the secret, but the requirement is now type-visible.
export const AuthConfigLive = Layer.effect(
  AuthConfig,
  Effect.map(CloudflareEnv, (env) =>
    AuthConfig.of({
      secret: Redacted.make(env.BETTER_AUTH_SECRET),
      url: env.BETTER_AUTH_URL,
    })
  )
)

export class AuthService extends Effect.Service<AuthService>()("AuthService", {
  dependencies: [AuthConfigLive, DatabaseLive],
  effect: Effect.gen(function* () {
    const db = yield* SqliteDrizzle.SqliteDrizzle
    const config = yield* AuthConfig

    const baseUrl = config.url.replace(/\/+$/, "")

    return betterAuth({
      database: drizzleAdapter(db, { provider: "sqlite" }),
      baseURL: baseUrl,
      secret: Redacted.value(config.secret),
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
          validAudiences: [`${baseUrl}/mcp`],
          // These discovery docs can't be served by Better Auth's own handler
          // (they live at root `.well-known/*`, outside the `/api/auth` basePath),
          // so we wire them as React Router routes — see app/routes.ts. The
          // plugin can't verify those exist, so silence its startup reminders.
          silenceWarnings: {
            oauthAuthServerConfig: true,
            openidConfig: true,
          },
        }),
      ],
    })
  }),
}) {}

// The better-auth instance type, derived from the effectful service so callers
// (middleware, route loaders) can type the resolved value.
export type Auth = AuthService
