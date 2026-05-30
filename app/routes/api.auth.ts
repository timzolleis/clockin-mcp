import { Effect } from "effect"
import type { AppLoadContext } from "react-router"
import { AuthService } from "~/lib/auth"
import { provideAuth } from "~/lib/auth-effect.server"
import type { Route } from "./+types/api.auth"

// Resolve the effectful better-auth instance for THIS request and run its
// handler. `provideAuth` layers in the single env-derived leaf (`CloudflareEnv`,
// from which the D1 binding and BETTER_AUTH_SECRET/URL are derived) per request
// — built fresh because the D1 binding only exists once a request arrives.
const handleAuth = (request: Request, context: AppLoadContext) =>
  Effect.gen(function* () {
    const auth = yield* AuthService
    return yield* Effect.promise(() => auth.handler(request))
  }).pipe(provideAuth(context.cloudflare.env), Effect.runPromise)

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleAuth(request, context)
export const action = ({ request, context }: Route.ActionArgs) =>
  handleAuth(request, context)
