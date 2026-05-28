import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"
import { TokenEncryptionConfig } from "~/lib/config/token-encryption-config"

export class EncryptedToken extends Schema.Class<EncryptedToken>(
  "EncryptedToken",
)({
  ciphertext: Schema.String,
  iv: Schema.String,
  authTag: Schema.String,
}) {}

export class TokenVault extends Effect.Service<TokenVault>()("TokenVault", {
  effect: Effect.gen(function* () {
    const { key: redactedKey } = yield* TokenEncryptionConfig
    const key = Redacted.value(redactedKey)

    const encrypt = (plaintext: string): Effect.Effect<EncryptedToken> =>
      Effect.sync(() => {
        const iv = randomBytes(12)
        const cipher = createCipheriv("aes-256-gcm", key, iv)
        const ct = Buffer.concat([
          cipher.update(plaintext, "utf8"),
          cipher.final(),
        ])
        return new EncryptedToken({
          ciphertext: ct.toString("base64"),
          iv: iv.toString("base64"),
          authTag: cipher.getAuthTag().toString("base64"),
        })
      })

    const decrypt = (payload: EncryptedToken): Effect.Effect<string> =>
      Effect.sync(() => {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(payload.iv, "base64"),
        )
        decipher.setAuthTag(Buffer.from(payload.authTag, "base64"))
        const pt = Buffer.concat([
          decipher.update(Buffer.from(payload.ciphertext, "base64")),
          decipher.final(),
        ])
        return pt.toString("utf8")
      })

    return { encrypt, decrypt } as const
  }),
  dependencies: [TokenEncryptionConfig.layer],
}) {}
