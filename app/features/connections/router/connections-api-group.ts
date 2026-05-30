import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { ServerError } from "~/lib/api/errors"
import { AuthMiddleware } from "~/lib/api/middleware/auth-middleware"
import { EnvMiddleware } from "~/lib/api/middleware/env-middleware"

// ---- responses ----

// One OAuth client the signed-in user has authorized to reach the MCP endpoint.
// `clientId` is the stable handle the revoke endpoint takes; the rest is display
// metadata sourced from the dynamic-registration record (may be absent).
export class ConnectedClient extends Schema.Class<ConnectedClient>(
  "ConnectedClient"
)({
  clientId: Schema.String,
  name: Schema.NullOr(Schema.String),
  uri: Schema.NullOr(Schema.String),
  scopes: Schema.Array(Schema.String),
  consentedAt: Schema.NullOr(Schema.Date),
  lastUsedAt: Schema.NullOr(Schema.Date),
}) {}

// ---- payloads ----

export class RevokeConnectionPayload extends Schema.Class<RevokeConnectionPayload>(
  "RevokeConnectionPayload"
)({
  clientId: Schema.String,
}) {}

// ---- group ----

export class ConnectionsApiGroup extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("list", "/")
      .addSuccess(Schema.Array(ConnectedClient))
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("revoke", "/revoke")
      .setPayload(RevokeConnectionPayload)
      .addSuccess(Schema.Void)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  // Group-level: provides `CloudflareEnv` per request so the env-derived DB graph
  // resolves; per-endpoint `AuthMiddleware` supplies the user on top.
  .middleware(EnvMiddleware)
  .prefix("/connections") {}
