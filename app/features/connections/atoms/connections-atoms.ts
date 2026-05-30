import { AtomV1ApiClient } from "~/features/api/client/api-client"

// Bumped by the revoke mutation to refetch the list.
export const CONNECTIONS_KEY = "connections" as const

export const connectionsAtom = AtomV1ApiClient.query("connections", "list", {
  reactivityKeys: [CONNECTIONS_KEY],
})

export const revokeConnectionMutation = AtomV1ApiClient.mutation(
  "connections",
  "revoke"
)

export const CONNECTIONS_INVALIDATIONS = [CONNECTIONS_KEY] as const
