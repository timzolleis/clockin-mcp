import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import {
  CurrentStatus,
  Project,
  TimeOverview,
  WorkdaySummary,
} from "~/lib/effect/clockin"
import { AuthMiddleware } from "~/lib/api/middleware/auth-middleware"
import {
  NotConfiguredError,
  ServerError,
  UpstreamError,
} from "~/lib/api/errors"

// ---- payloads ----

export class SetupPayload extends Schema.Class<SetupPayload>("SetupPayload")({
  email: Schema.String,
  password: Schema.String,
  employeeIdOverride: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

export class StartProjectPayload extends Schema.Class<StartProjectPayload>(
  "StartProjectPayload",
)({
  projectId: Schema.Number,
  projectDateId: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

export class SearchProjectsPayload extends Schema.Class<SearchProjectsPayload>(
  "SearchProjectsPayload",
)({
  query: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

// ---- responses ----

export class ConfigurationStatus extends Schema.Class<ConfigurationStatus>(
  "ConfigurationStatus",
)({
  configured: Schema.Boolean,
  employeeId: Schema.NullOr(Schema.Number),
  updatedAt: Schema.NullOr(Schema.Date),
}) {}

export class SetupResult extends Schema.Class<SetupResult>("SetupResult")({
  employeeId: Schema.Number,
  autoDetected: Schema.Boolean,
}) {}

export class OkResult extends Schema.Class<OkResult>("OkResult")({
  ok: Schema.Literal(true),
}) {}

// ---- group ----

export class ClockinApiGroup extends HttpApiGroup.make("clockin")
  .add(
    HttpApiEndpoint.get("status", "/status")
      .addSuccess(ConfigurationStatus)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("setup", "/setup")
      .setPayload(SetupPayload)
      .addSuccess(SetupResult)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.get("current", "/current")
      .addSuccess(CurrentStatus)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.get("workdays", "/workdays")
      .addSuccess(Schema.Array(WorkdaySummary))
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.get("overview", "/overview")
      .addSuccess(TimeOverview)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("projects", "/projects")
      .setPayload(SearchProjectsPayload)
      .addSuccess(Schema.Array(Project))
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("clockIn", "/events/clock-in")
      .addSuccess(OkResult)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("clockOut", "/events/clock-out")
      .addSuccess(OkResult)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("startBreak", "/events/break")
      .addSuccess(OkResult)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("resumeWork", "/events/resume")
      .addSuccess(OkResult)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .add(
    HttpApiEndpoint.post("startProject", "/events/project")
      .setPayload(StartProjectPayload)
      .addSuccess(OkResult)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware),
  )
  .prefix("/clockin") {}
