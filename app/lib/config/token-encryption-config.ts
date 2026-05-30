import { Context, Effect, Layer, Redacted } from "effect"
import { CloudflareEnv } from "~/lib/effect/cloudflare-env"

export interface TokenEncryptionConfigShape {
  readonly key: Redacted.Redacted<Buffer>
}

export class TokenEncryptionConfig extends Context.Tag("TokenEncryptionConfig")<
  TokenEncryptionConfig,
  TokenEncryptionConfigShape
>() {
  static readonly layer: Layer.Layer<TokenEncryptionConfig, never, CloudflareEnv> =
    Layer.effect(
      TokenEncryptionConfig,
      Effect.gen(function* () {
        const env = yield* CloudflareEnv
        const buf = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64")
        if (buf.length !== 32) {
          return yield* Effect.dieMessage(
            `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Generate with: openssl rand -base64 32`,
          )
        }
        return TokenEncryptionConfig.of({ key: Redacted.make(buf) })
      }),
    )
}
