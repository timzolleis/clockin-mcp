import { AtomHttpApi } from "@effect-atom/atom-react"
import { FetchHttpClient, HttpClient } from "@effect/platform"
import { Layer } from "effect"

import { ApiV1Group } from "~/lib/api/api-v1-group"

// Send cookies so better-auth's session cookie is included on every call.
const FetchWithCredentials = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }),
  ),
)

export class AtomV1ApiClient extends AtomHttpApi.Tag<AtomV1ApiClient>()(
  "AtomV1ApiClient",
  {
    api: ApiV1Group,
    httpClient: FetchWithCredentials,
    baseUrl: "",
    transformClient: (client) =>
      client.pipe(HttpClient.withTracerPropagation(false)),
  },
) {}
