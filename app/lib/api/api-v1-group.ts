import { HttpApi } from "@effect/platform"
import { ServerError } from "~/lib/api/errors"
import { ClockinApiGroup } from "~/lib/api/clockin-api-group"

export class ApiV1Group extends HttpApi.make("v1")
  .addError(ServerError)
  .add(ClockinApiGroup)
  .prefix("/api/v1") {}
