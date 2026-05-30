import { Context, Effect, Layer, Redacted } from "effect"
import {
  ClockinCredentials,
  CredentialsNotFoundError,
  type UserId,
} from "~/lib/domain/credentials"
import { TokenVault } from "~/lib/effect/vault.server"
import { CredentialsRepository } from "./credentials-repository"
import { CredentialsRepositoryLive } from "./credentials-repository-live"

/**
 * Returns decrypted, ready-to-use credentials for an upstream Clockin call.
 * Errors with `CredentialsNotFoundError` when the user hasn't configured
 * Clockin yet — callers decide whether that's a 4xx (API) or a friendly
 * fallback (MCP tool) via `Effect.catchTag`.
 */
export interface ClockinCredentialsServiceShape {
  getCredentials: (args: {
    userId: UserId
  }) => Effect.Effect<ClockinCredentials, CredentialsNotFoundError>
}

export class ClockinCredentialsService extends Context.Tag(
  "ClockinCredentialsService",
)<ClockinCredentialsService, ClockinCredentialsServiceShape>() {}

export const ClockinCredentialsServiceLive = Layer.effect(
  ClockinCredentialsService,
  Effect.gen(function* () {
    const repo = yield* CredentialsRepository
    const vault = yield* TokenVault
    return ClockinCredentialsService.of({
      getCredentials: Effect.fn("clockinCredentialsService.getCredentials")(
        function* ({ userId }) {
          yield* Effect.annotateCurrentSpan({ "user.id": userId })
          const stored = yield* repo.findByUser({ userId })
          const userTokenPlain = yield* vault.decrypt(stored.userToken)
          const deviceTokenPlain = yield* vault.decrypt(stored.deviceToken)
          return new ClockinCredentials({
            employeeId: stored.employeeId,
            userToken: Redacted.make(userTokenPlain),
            deviceToken: Redacted.make(deviceTokenPlain),
          })
        },
      ),
    })
  }),
).pipe(
  // Self-contained: bundle the repo + vault so consumers can just merge this
  // layer in without separately wiring the dependencies. provideMerge keeps
  // the bundled tags exposed for direct use (the API group reads the repo +
  // vault directly from the handler context).
  Layer.provideMerge(CredentialsRepositoryLive),
  Layer.provideMerge(TokenVault.Default),
)
