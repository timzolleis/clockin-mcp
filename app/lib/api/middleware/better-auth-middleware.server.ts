import { HttpServerRequest } from "@effect/platform"
import { Effect, Layer, Option } from "effect"
import {
  AuthenticatedUser,
  AuthMiddleware,
} from "~/lib/api/middleware/auth-middleware"
import { UnauthorizedError } from "~/lib/api/middleware/authentication-errors"
import { AuthService } from "~/lib/auth"
import { provideAuth } from "~/lib/auth-effect.server"
import { AppContext } from "~/lib/server/app-context"

// The middleware VALUE is a single per-request effect (no build-time deps to
// capture, so `Layer.succeed` rather than `Layer.effect`). It runs inside the
// request fiber, so it can read the injected `AppContext` and build the
// effectful better-auth instance against THIS request's D1 + config, then
// resolve the session into `AuthenticatedUser`.
export const BetterAuthMiddlewareLive = Layer.succeed(
  AuthMiddleware,
  Effect.gen(function* () {
    // `HttpApiMiddleware`'s R is fixed to `HttpRouter.Provided`, so we can't
    // require `AppContext` directly. `serviceOption` reads it from the request
    // fiber context (where it's injected per request) WITHOUT adding it to R.
    const ctx = yield* Effect.serviceOption(AppContext).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.dieMessage(
              "AppContext not injected — call handleV1(request, ctx)."
            ),
          onSome: Effect.succeed,
        })
      )
    )
    const env = ctx.cloudflare.env
    const request = yield* HttpServerRequest.HttpServerRequest

    // Self-contained: `provideAuth` layers in `CloudflareEnv` (D1 binding +
    // config derive from it), so the auth instance doesn't rely on the outer v1
    // fiber having provided anything.
    const auth = yield* AuthService.pipe(provideAuth(env))

    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: request.headers }),
      catch: (cause) =>
        new UnauthorizedError({
          message: `Failed to load session: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        }),
    })
    if (!session) {
      return yield* new UnauthorizedError({ message: "Session not found" })
    }
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    } satisfies AuthenticatedUser["Type"]
  })
)
