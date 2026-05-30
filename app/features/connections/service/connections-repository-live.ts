import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { ConnectedClient } from "~/features/connections/router/connections-api-group"
import { ConnectionsRepository } from "~/features/connections/service/connections-repository"
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "~/lib/db/auth-schema"
import { SqliteDrizzle } from "~/lib/effect/db"

// `oauth_consent.scopes` / `oauth_client.scopes` are JSON columns typed as
// `unknown` by drizzle — narrow to a string[] defensively.
const toScopes = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.map(String) : []

export const ConnectionsRepositoryLive = Layer.effect(
  ConnectionsRepository,
  Effect.gen(function* () {
    const db = yield* SqliteDrizzle.SqliteDrizzle

    return ConnectionsRepository.of({
      listForUser: Effect.fn("connectionsRepository.listForUser")(function* ({
        userId,
      }) {
        yield* Effect.annotateCurrentSpan({ "user.id": userId })

        // Consents joined to their registration metadata (name/uri may be null
        // for minimally-registered clients).
        const consents = yield* db
          .select({
            clientId: oauthConsent.clientId,
            scopes: oauthConsent.scopes,
            consentedAt: oauthConsent.createdAt,
            name: oauthClient.name,
            uri: oauthClient.uri,
          })
          .from(oauthConsent)
          .leftJoin(
            oauthClient,
            eq(oauthClient.clientId, oauthConsent.clientId)
          )
          .where(eq(oauthConsent.userId, userId))
          .pipe(Effect.orDie)

        // Most recent access-token issuance per client = a "last used" signal.
        const tokens = yield* db
          .select({
            clientId: oauthAccessToken.clientId,
            createdAt: oauthAccessToken.createdAt,
          })
          .from(oauthAccessToken)
          .where(eq(oauthAccessToken.userId, userId))
          .pipe(Effect.orDie)

        const lastUsed = new Map<string, Date>()
        for (const t of tokens) {
          if (!t.createdAt) continue
          const prev = lastUsed.get(t.clientId)
          if (!prev || t.createdAt.getTime() > prev.getTime()) {
            lastUsed.set(t.clientId, t.createdAt)
          }
        }

        return consents
          .map(
            (row) =>
              new ConnectedClient({
                clientId: row.clientId,
                name: row.name ?? null,
                uri: row.uri ?? null,
                scopes: toScopes(row.scopes),
                consentedAt: row.consentedAt ?? null,
                lastUsedAt: lastUsed.get(row.clientId) ?? null,
              })
          )
          .sort((a, b) => {
            const at = a.consentedAt?.getTime() ?? 0
            const bt = b.consentedAt?.getTime() ?? 0
            return bt - at
          })
      }),

      revokeForUser: Effect.fn("connectionsRepository.revokeForUser")(
        function* ({ userId, clientId }) {
          yield* Effect.annotateCurrentSpan({
            "user.id": userId,
            "client.id": clientId,
          })

          // Access tokens first (they FK onto refresh tokens), then refresh
          // tokens, then the consent record. All scoped to this user + client.
          yield* db
            .delete(oauthAccessToken)
            .where(
              and(
                eq(oauthAccessToken.userId, userId),
                eq(oauthAccessToken.clientId, clientId)
              )
            )
            .pipe(Effect.orDie)

          yield* db
            .delete(oauthRefreshToken)
            .where(
              and(
                eq(oauthRefreshToken.userId, userId),
                eq(oauthRefreshToken.clientId, clientId)
              )
            )
            .pipe(Effect.orDie)

          yield* db
            .delete(oauthConsent)
            .where(
              and(
                eq(oauthConsent.userId, userId),
                eq(oauthConsent.clientId, clientId)
              )
            )
            .pipe(Effect.orDie)
        }
      ),
    })
  })
)
