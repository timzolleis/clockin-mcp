import { Config, Context, Effect, Layer } from "effect"

export interface DatabaseConfigShape {
  readonly filename: string
}

export class DatabaseConfig extends Context.Tag("DatabaseConfig")<
  DatabaseConfig,
  DatabaseConfigShape
>() {
  static readonly layer: Layer.Layer<DatabaseConfig> = Layer.effect(
    DatabaseConfig,
    Effect.gen(function* () {
      const config = yield* Config.all({
        filename: Config.string("DATABASE_URL"),
      }).pipe(Effect.orDie)
      return DatabaseConfig.of(config)
    }),
  )
}
