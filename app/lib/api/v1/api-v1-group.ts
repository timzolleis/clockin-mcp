import { HttpApi } from "@effect/platform"
import { ClockinApiGroup } from "~/features/clockin/router/clockin-api-group"
import { ConnectionsApiGroup } from "~/features/connections/router/connections-api-group"
import { ServerError } from "~/lib/api/errors"

export class ApiV1Group extends HttpApi.make("v1")
  .addError(ServerError)
  .add(ClockinApiGroup)
  .add(ConnectionsApiGroup)
  .prefix("/api/v1") {}
