import { HttpServerRequest } from "@effect/platform"
import { Effect, Layer } from "effect"
import { auth } from "~/lib/auth"
import { UnauthorizedError } from "~/lib/api/errors"
import {
  AuthenticatedUser,
  AuthMiddleware,
} from "~/lib/api/middleware/auth-middleware"

export const BetterAuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.succeed(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
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
      const u: AuthenticatedUser["Type"] = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }
      return u
    }),
  ),
)
