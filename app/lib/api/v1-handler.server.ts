import { HttpApiBuilder, HttpServer } from "@effect/platform"
import { Layer } from "effect"
import type { AppLoadContext } from "react-router"
import { ApiV1GroupLive } from "~/features/clockin/router/clockin-api-group.server"
import { AppContext } from "~/lib/server/app-context"

// Built ONCE at module load. Nothing in the graph requires `AppContext` as a
// static dependency — both middlewares read it per request via `serviceOption`
// (so it stays out of `R`), and the env-derived service graph is satisfied by
// `EnvMiddleware`'s `provides: CloudflareEnv`. So the build bottoms out at
// `never` with no placeholder needed.
const { handler: webHandler } = HttpApiBuilder.toWebHandler(
  ApiV1GroupLive.pipe(Layer.provideMerge(HttpServer.layerContext))
)

// Inject the React Router request context for this request. The middlewares read
// it from the request fiber (via `serviceOption`) to derive this request's
// `cloudflare.env` (D1 binding + secrets) and resolve the session.
export const handleV1 = (request: Request, context: AppLoadContext) =>
  webHandler(request, AppContext.context(context))
