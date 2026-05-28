import { Config, Context, Effect, Layer, Redacted } from "effect"

export interface TokenEncryptionConfigShape {
  readonly key: Redacted.Redacted<Buffer>
}

export class TokenEncryptionConfig extends Context.Tag("TokenEncryptionConfig")<
  TokenEncryptionConfig,
  TokenEncryptionConfigShape
>() {
  static readonly layer: Layer.Layer<TokenEncryptionConfig> = Layer.effect(
    TokenEncryptionConfig,
    Effect.gen(function* () {
      const raw = yield* Config.redacted("TOKEN_ENCRYPTION_KEY").pipe(
        Effect.orDie,
      )
      const buf = Buffer.from(Redacted.value(raw), "base64")
      if (buf.length !== 32) {
        return yield* Effect.dieMessage(
          `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Generate with: openssl rand -base64 32`,
        )
      }
      return TokenEncryptionConfig.of({ key: Redacted.make(buf) })
    }),
  )
}
