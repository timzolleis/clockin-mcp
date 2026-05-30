import { Context, Effect, Layer } from "effect"
import { CloudflareEnv } from "~/lib/effect/cloudflare-env"

const DEFAULT_BASE_URL = "https://mobile.clockin.de/v2"

export interface ClockinConfigShape {
  readonly baseUrl: string
}

export class ClockinConfig extends Context.Tag("ClockinConfig")<
  ClockinConfig,
  ClockinConfigShape
>() {
  // `CLOCKIN_BASE_URL` is optional on `Env`; fall back to the upstream default.
  static readonly layer: Layer.Layer<ClockinConfig, never, CloudflareEnv> =
    Layer.effect(
      ClockinConfig,
      Effect.map(CloudflareEnv, (env) =>
        ClockinConfig.of({
          baseUrl: (env.CLOCKIN_BASE_URL ?? DEFAULT_BASE_URL).replace(
            /\/+$/,
            "",
          ),
        }),
      ),
    )
}
