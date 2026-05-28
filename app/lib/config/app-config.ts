import { Config, Context, Effect, Layer } from "effect"

export interface AppConfigShape {
  readonly baseUrl: string
}

export class AppConfig extends Context.Tag("AppConfig")<
  AppConfig,
  AppConfigShape
>() {
  static readonly layer: Layer.Layer<AppConfig> = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const config = yield* Config.all({
        baseUrl: Config.string("BETTER_AUTH_URL"),
      }).pipe(Effect.orDie)
      return AppConfig.of({
        baseUrl: config.baseUrl.replace(/\/+$/, ""),
      })
    }),
  )
}
