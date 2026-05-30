import { eq } from "drizzle-orm"
import { Clock, Effect, Layer } from "effect"
import { CredentialsRepository } from "~/features/clockin/credentials/credentials-repository"
import { userToken } from "~/lib/db/schema"
import {
  CredentialsNotFoundError,
  StoredCredentials,
  UserId,
} from "~/lib/domain/credentials"
import { EmployeeId } from "~/lib/domain/employee"
import { SqliteDrizzle } from "~/lib/effect/db"
import { EncryptedToken } from "~/lib/effect/vault.server"

type Row = typeof userToken.$inferSelect

const toStoredCredentials = (row: Row): StoredCredentials =>
  new StoredCredentials({
    userId: UserId.make(row.userId),
    employeeId: EmployeeId.make(row.employeeId),
    userToken: new EncryptedToken({
      ciphertext: row.userCiphertext,
      iv: row.userIv,
      authTag: row.userAuthTag,
    }),
    deviceToken: new EncryptedToken({
      ciphertext: row.deviceCiphertext,
      iv: row.deviceIv,
      authTag: row.deviceAuthTag,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export interface CredentialsUpsertInput {
  readonly userId: UserId
  readonly employeeId: EmployeeId
  readonly userToken: EncryptedToken
  readonly deviceToken: EncryptedToken
}

export const CredentialsRepositoryLive = Layer.effect(
  CredentialsRepository,
  Effect.gen(function* () {
    const db = yield* SqliteDrizzle.SqliteDrizzle
    return CredentialsRepository.of({
      findByUser: Effect.fn("credentialsRepository.findByUser")(function* ({
        userId,
      }) {
        yield* Effect.annotateCurrentSpan({ "user.id": userId })

        const rows = yield* db
          .select()
          .from(userToken)
          .where(eq(userToken.userId, userId))
          .limit(1)
          .pipe(Effect.orDie)
        if (rows.length === 0) {
          return yield* new CredentialsNotFoundError({ userId })
        }
        return toStoredCredentials(rows[0])
      }),
      save: Effect.fn("credentialsRepository.save")(function* (input) {
        yield* Effect.annotateCurrentSpan({
          "user.id": input.userId,
          "employee.id": input.employeeId,
        })
        const nowMillis = yield* Clock.currentTimeMillis

        const now = new Date(nowMillis)
        const rows = yield* db
          .insert(userToken)
          .values({
            userId: input.userId,
            userCiphertext: input.userToken.ciphertext,
            userIv: input.userToken.iv,
            userAuthTag: input.userToken.authTag,
            deviceCiphertext: input.deviceToken.ciphertext,
            deviceIv: input.deviceToken.iv,
            deviceAuthTag: input.deviceToken.authTag,
            employeeId: input.employeeId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userToken.userId,
            set: {
              userCiphertext: input.userToken.ciphertext,
              userIv: input.userToken.iv,
              userAuthTag: input.userToken.authTag,
              deviceCiphertext: input.deviceToken.ciphertext,
              deviceIv: input.deviceToken.iv,
              deviceAuthTag: input.deviceToken.authTag,
              employeeId: input.employeeId,
              updatedAt: now,
            },
          })
          .returning()
          .pipe(Effect.orDie)
        return toStoredCredentials(rows[0])
      }),
    })
  })
)
