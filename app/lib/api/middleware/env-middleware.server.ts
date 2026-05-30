import { Effect, Layer, Option } from "effect"
import { EnvMiddleware } from "~/lib/api/middleware/env-middleware"
import { AppContext } from "~/lib/server/app-context"

// Per-request effect (no build-time deps, so `Layer.succeed`). Runs inside the
// request fiber, reads the injected `AppContext` via `serviceOption` — which
// does NOT add it to `R` — and yields this request's `cloudflare.env`. Because
// the read is optional, `AppContext` never becomes a static requirement, so the
// v1 web handler needs no build-time placeholder for it.
export const EnvMiddlewareLive = Layer.succeed(
  EnvMiddleware,
  Effect.gen(function* () {
    const ctx = yield* Effect.serviceOption(AppContext).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.dieMessage(
              "AppContext not injected — call handleV1(request, ctx)."
            ),
          onSome: Effect.succeed,
        })
      )
    )
    return ctx.cloudflare.env
  })
)
