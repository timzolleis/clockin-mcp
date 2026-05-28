import { Config, Context, Effect, Layer } from "effect"

export interface ClockinConfigShape {
  readonly baseUrl: string
}

export class ClockinConfig extends Context.Tag("ClockinConfig")<
  ClockinConfig,
  ClockinConfigShape
>() {
  static readonly layer: Layer.Layer<ClockinConfig> = Layer.effect(
    ClockinConfig,
    Effect.gen(function* () {
      const config = yield* Config.all({
        baseUrl: Config.string("CLOCKIN_BASE_URL").pipe(
          Config.withDefault("https://mobile.clockin.de/v2"),
        ),
      }).pipe(Effect.orDie)
      return ClockinConfig.of({
        baseUrl: config.baseUrl.replace(/\/+$/, ""),
      })
    }),
  )
}
