import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"
import { ConnectionsRepository } from "~/features/connections/service/connections-repository"
import { ConnectionsRepositoryLive } from "~/features/connections/service/connections-repository-live"
import { AuthenticatedUser } from "~/lib/api/middleware/auth-middleware"
import { mapServerError } from "~/lib/api/errors"
import { ApiV1Group } from "~/lib/api/v1/api-v1-group"
import { UserId } from "~/lib/domain/credentials"
import { DatabaseLive } from "~/lib/effect/db"

// The repository + its DB dependency, leaving `CloudflareEnv` as the only
// requirement — supplied per request by `EnvMiddleware` (see the group's
// `.middleware(EnvMiddleware)`).
const ConnectionsServicesLive = ConnectionsRepositoryLive.pipe(
  Layer.provideMerge(DatabaseLive)
)

const provide = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  eff.pipe(Effect.provide(ConnectionsServicesLive))

export const ConnectionsApiGroupLive = HttpApiBuilder.group(
  ApiV1Group,
  "connections",
  (handlers) =>
    Effect.succeed(
      handlers
        .handle("list", () =>
          provide(
            mapServerError(
              Effect.gen(function* () {
                const repo = yield* ConnectionsRepository
                const user = yield* AuthenticatedUser
                return yield* repo.listForUser({
                  userId: UserId.make(user.id),
                })
              })
            )
          )
        )
        .handle("revoke", ({ payload }) =>
          provide(
            mapServerError(
              Effect.gen(function* () {
                const repo = yield* ConnectionsRepository
                const user = yield* AuthenticatedUser
                yield* repo.revokeForUser({
                  userId: UserId.make(user.id),
                  clientId: payload.clientId,
                })
              })
            )
          )
        )
    )
)
