import { HttpApiBuilder, HttpServer } from "@effect/platform"
import { Layer } from "effect"
import { ApiV1GroupLive } from "~/lib/api/clockin-api-group.server"
import type { Route } from "./+types/api.v1.$"

const { handler } = HttpApiBuilder.toWebHandler(
  ApiV1GroupLive.pipe(Layer.provideMerge(HttpServer.layerContext)),
)

export const loader = ({ request }: Route.LoaderArgs) => handler(request)
export const action = ({ request }: Route.ActionArgs) => handler(request)
