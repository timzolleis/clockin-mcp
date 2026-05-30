import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { Effect } from "effect"
import { AuthService } from "~/lib/auth"
import { provideAuth } from "~/lib/auth-effect.server"
import type { Route } from "./+types/oauth-authorization-server"

export const loader = ({ request, context }: Route.LoaderArgs) =>
  Effect.gen(function* () {
    const auth = yield* AuthService
    return yield* Effect.promise(() =>
      oauthProviderAuthServerMetadata(auth)(request),
    )
  }).pipe(provideAuth(context.cloudflare.env), Effect.runPromise)
