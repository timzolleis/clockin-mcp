import { Context, type Effect } from "effect"
import type { ConnectedClient } from "~/features/connections/router/connections-api-group"
import type { UserId } from "~/lib/domain/credentials"

// Reads/mutates the better-auth OAuth tables (`oauth_consent`, `oauth_client`,
// `oauth_access_token`, `oauth_refresh_token`) for one user. These rows are
// created by the `oauthProvider` plugin when an MCP client completes OAuth.
export class ConnectionsRepository extends Context.Tag("ConnectionsRepository")<
  ConnectionsRepository,
  {
    // Every client the user has an active consent for, newest first.
    readonly listForUser: (input: {
      readonly userId: UserId
    }) => Effect.Effect<ReadonlyArray<ConnectedClient>>

    // Cut off a client: delete the user's tokens AND consent for it, so any
    // live access token stops working and the next connect re-prompts consent.
    // Scoped to (userId, clientId) — the shared client registration is left
    // intact. No-op if nothing matches.
    readonly revokeForUser: (input: {
      readonly userId: UserId
      readonly clientId: string
    }) => Effect.Effect<void>
  }
>() {}
