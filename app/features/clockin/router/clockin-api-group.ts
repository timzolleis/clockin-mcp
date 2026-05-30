import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import {
  NotConfiguredError,
  ServerError,
  UpstreamError,
} from "~/lib/api/errors"
import { AuthMiddleware } from "~/lib/api/middleware/auth-middleware"
import { EnvMiddleware } from "~/lib/api/middleware/env-middleware"
import { EmployeeId } from "~/lib/domain/employee"
import { ProjectId } from "~/lib/domain/project"
import { CurrentStatus } from "~/lib/domain/status"
import { Project } from "~/lib/domain/project"
import { TimeOverview } from "~/lib/domain/timesheet"
import { WorkdaySummary } from "~/lib/domain/workday"

// ---- payloads ----

export class SetupAccountPayload extends Schema.Class<SetupAccountPayload>(
  "SetupAccountPayload"
)({
  email: Schema.String,
  password: Schema.String,
}) {}

export class StartProjectPayload extends Schema.Class<StartProjectPayload>(
  "StartProjectPayload"
)({
  projectId: ProjectId,
  projectDateId: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

// ---- responses ----

export class AccountConfigurationStatusResponse extends Schema.Class<AccountConfigurationStatusResponse>(
  "AccountConfigurationStatusResponse"
)({
  configured: Schema.Boolean,
  employeeId: Schema.NullOr(EmployeeId),
  updatedAt: Schema.NullOr(Schema.Date),
}) {}

export class AccountSetupResponse extends Schema.Class<AccountSetupResponse>(
  "AccountSetupResponse"
)({
  employeeId: EmployeeId,
  autoDetected: Schema.Boolean,
}) {}

// ---- group ----

export class ClockinApiGroup extends HttpApiGroup.make("clockin")
  .add(
    HttpApiEndpoint.get("status", "/status")
      .addSuccess(AccountConfigurationStatusResponse)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("setup", "/setup")
      .setPayload(SetupAccountPayload)
      .addSuccess(AccountSetupResponse)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.get("current", "/current")
      .addSuccess(CurrentStatus)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.get("workdays", "/workdays")
      .addSuccess(Schema.Array(WorkdaySummary))
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.get("overview", "/overview")
      .addSuccess(TimeOverview)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("projects", "/projects")
      .addSuccess(Schema.Array(Project))
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("clockIn", "/events/clock-in")
      .addSuccess(Schema.Void)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("clockOut", "/events/clock-out")
      .addSuccess(Schema.Void)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("startBreak", "/events/break")
      .addSuccess(Schema.Void)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("resumeWork", "/events/resume")
      .addSuccess(Schema.Void)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.post("startProject", "/events/project")
      .setPayload(StartProjectPayload)
      .addSuccess(Schema.Void)
      .addError(NotConfiguredError)
      .addError(UpstreamError)
      .addError(ServerError)
      .middleware(AuthMiddleware)
  )
  // Group-level: provides `CloudflareEnv` to every handler in this request, so
  // the env-derived service graph resolves without `AppContext` entering the
  // static build `R`. Per-endpoint `AuthMiddleware` still layers on top.
  .middleware(EnvMiddleware)
  .prefix("/clockin") {}
