import { Effect } from "effect"
import { AuthService } from "~/lib/auth"
import { provideAuth } from "~/lib/auth-effect.server"
import { createServerClient } from "~/lib/auth-server-client"
import type { Route } from "./+types/oauth-protected-resource"

export const loader = ({ context }: Route.LoaderArgs) => {
  const env = context.cloudflare.env
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "")
  return Effect.gen(function* () {
    const auth = yield* AuthService
    const metadata = yield* Effect.promise(() =>
      createServerClient(auth).getProtectedResourceMetadata({
        resource: `${baseUrl}/mcp`,
        authorization_servers: [`${baseUrl}/api/auth`],
      }),
    )
    return Response.json(metadata, {
      headers: {
        "Cache-Control":
          "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
      },
    })
  }).pipe(provideAuth(env), Effect.runPromise)
}
