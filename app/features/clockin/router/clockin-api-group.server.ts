import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer, Option, Redacted } from "effect"
import { CredentialsRepository } from "~/features/clockin/credentials/credentials-repository"
import { ClockinCredentialsService } from "~/features/clockin/credentials/credentials-service"
import { RequestServicesLive } from "~/features/clockin/router/request-services.server"
import {
  ClockinAuth,
  LoginInput,
} from "~/features/clockin/service/clockin-auth"
import { CurrentClockinCredentials } from "~/features/clockin/service/clockin-client"
import { ClockinEmployee } from "~/features/clockin/service/clockin-employee"
import { ClockinEvents } from "~/features/clockin/service/clockin-events"
import { ClockinProjects } from "~/features/clockin/service/clockin-projects"
import { ClockinStatus } from "~/features/clockin/service/clockin-status"
import { ClockinTimesheets } from "~/features/clockin/service/clockin-timesheets"
import { ClockinWorkdays } from "~/features/clockin/service/clockin-workdays"
import { ClockinCredentials, UserId } from "~/lib/domain/credentials"
import { EmployeeId } from "~/lib/domain/employee"
import { ProjectDateId } from "~/lib/domain/project"
import { TokenVault } from "~/lib/effect/vault.server"
import { ApiV1Group } from "~/lib/api/v1/api-v1-group"
import {
  AccountConfigurationStatusResponse,
  AccountSetupResponse,
} from "~/features/clockin/router/clockin-api-group"
import { ConnectionsApiGroupLive } from "~/features/connections/router/connections-api-group.server"
import { AuthenticatedUser } from "~/lib/api/middleware/auth-middleware"
import { BetterAuthMiddlewareLive } from "~/lib/api/middleware/better-auth-middleware.server"
import { EnvMiddlewareLive } from "~/lib/api/middleware/env-middleware.server"
import {
  NotConfiguredError,
  UpstreamError,
  mapServerError,
} from "~/lib/api/errors"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Provide the per-request service graph to a handler effect. After this, the
// effect's only leftover requirements are `AppContext` (injected per request by
// the web handler) and `AuthenticatedUser` (supplied by the auth middleware).
const provide = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  eff.pipe(Effect.provide(RequestServicesLive))

// Load + decrypt the current user's Clockin credentials. `CredentialsNotFound`
// becomes a friendly NotConfigured response pointing at /settings.
const requireTokens = Effect.gen(function* () {
  const user = yield* AuthenticatedUser
  const service = yield* ClockinCredentialsService
  return yield* service.getCredentials({ userId: UserId.make(user.id) }).pipe(
    Effect.catchTag(
      "CredentialsNotFoundError",
      () =>
        new NotConfiguredError({
          message: "Visit /settings to connect your Clockin account.",
        })
    )
  )
})

// Run an upstream call with the current user's decrypted credentials in context
// (the authenticated Clockin clients read `CurrentClockinCredentials` per call).
const withTokens = <A, E, R>(
  eff: Effect.Effect<A, E, R | CurrentClockinCredentials>
) =>
  Effect.flatMap(requireTokens, (creds) =>
    eff.pipe(Effect.provideService(CurrentClockinCredentials, creds))
  )

const intoUpstreamError = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  eff.pipe(
    Effect.mapError(
      (cause) =>
        new UpstreamError({
          message:
            cause instanceof Error
              ? cause.message
              : typeof cause === "string"
                ? cause
                : JSON.stringify(cause),
        })
    )
  )

// ---------------------------------------------------------------------------
// Handler layer
// ---------------------------------------------------------------------------
// Handlers no longer capture services at build time — each one yields what it
// needs inside its own per-request effect and provides `RequestServicesLive`.

export const ClockinApiGroupLive = HttpApiBuilder.group(
  ApiV1Group,
  "clockin",
  (handlers) =>
    Effect.succeed(
      handlers
        .handle("status", () =>
          provide(
            mapServerError(
              Effect.gen(function* () {
                const credentials = yield* CredentialsRepository
                const user = yield* AuthenticatedUser
                const stored = yield* credentials
                  .findByUser({ userId: UserId.make(user.id) })
                  .pipe(
                    Effect.map(Option.some),
                    Effect.catchTag("CredentialsNotFoundError", () =>
                      Effect.succeed(Option.none())
                    )
                  )
                return Option.match(stored, {
                  onNone: () =>
                    new AccountConfigurationStatusResponse({
                      configured: false,
                      employeeId: null,
                      updatedAt: null,
                    }),
                  onSome: (s) =>
                    new AccountConfigurationStatusResponse({
                      configured: true,
                      employeeId: s.employeeId,
                      updatedAt: s.updatedAt,
                    }),
                })
              })
            )
          )
        )
        .handle("setup", ({ payload }) =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const auth = yield* ClockinAuth
                  const empSvc = yield* ClockinEmployee
                  const vault = yield* TokenVault
                  const credentials = yield* CredentialsRepository
                  const user = yield* AuthenticatedUser

                  const loginData = yield* auth.login(
                    new LoginInput({
                      email: payload.email,
                      password: payload.password,
                    })
                  )
                  // /device/employees returns the employees this device may post
                  // events for. For personal accounts it's a single entry — its
                  // `id` is the employee_id /events/storeMany expects.
                  const employees = yield* empSvc.employees().pipe(
                    Effect.provideService(
                      CurrentClockinCredentials,
                      new ClockinCredentials({
                        employeeId: EmployeeId.make(0),
                        userToken: loginData.userToken,
                        deviceToken: loginData.deviceToken,
                      })
                    )
                  )
                  const employeeId = employees[0]?.id ?? null
                  if (
                    employeeId == null ||
                    !Number.isFinite(employeeId) ||
                    employeeId <= 0
                  ) {
                    return yield* new UpstreamError({
                      message: `Login succeeded but /device/employees returned no usable employee_id. Got: ${JSON.stringify(employees)}.`,
                    })
                  }
                  const userBlob = yield* vault.encrypt(
                    Redacted.value(loginData.userToken)
                  )
                  const deviceBlob = yield* vault.encrypt(
                    Redacted.value(loginData.deviceToken)
                  )
                  yield* credentials.save({
                    userId: UserId.make(user.id),
                    employeeId: EmployeeId.make(employeeId),
                    userToken: userBlob,
                    deviceToken: deviceBlob,
                  })
                  return new AccountSetupResponse({
                    employeeId: EmployeeId.make(employeeId),
                    autoDetected: true,
                  })
                })
              )
            )
          )
        )
        .handle("current", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const status = yield* ClockinStatus
                  return yield* withTokens(status.current())
                })
              )
            )
          )
        )
        .handle("workdays", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const workdays = yield* ClockinWorkdays
                  return yield* withTokens(workdays.summaries())
                })
              )
            )
          )
        )
        .handle("overview", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const timesheets = yield* ClockinTimesheets
                  return yield* withTokens(timesheets.overview())
                })
              )
            )
          )
        )
        .handle("projects", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const projects = yield* ClockinProjects
                  return yield* withTokens(projects.list())
                })
              )
            )
          )
        )
        .handle("clockIn", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const events = yield* ClockinEvents
                  return yield* withTokens(events.clockIn())
                })
              ).pipe(Effect.asVoid)
            )
          )
        )
        .handle("clockOut", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const events = yield* ClockinEvents
                  return yield* withTokens(events.clockOut())
                })
              ).pipe(Effect.asVoid)
            )
          )
        )
        .handle("startBreak", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const events = yield* ClockinEvents
                  return yield* withTokens(events.startBreak())
                })
              ).pipe(Effect.asVoid)
            )
          )
        )
        .handle("resumeWork", () =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const events = yield* ClockinEvents
                  return yield* withTokens(events.resumeWork())
                })
              ).pipe(Effect.asVoid)
            )
          )
        )
        .handle("startProject", ({ payload }) =>
          provide(
            mapServerError(
              intoUpstreamError(
                Effect.gen(function* () {
                  const events = yield* ClockinEvents
                  return yield* withTokens(
                    events.startProject(
                      payload.projectId,
                      payload.projectDateId != null
                        ? ProjectDateId.make(payload.projectDateId)
                        : undefined
                    )
                  )
                })
              ).pipe(Effect.asVoid)
            )
          )
        )
    )
)

// ---------------------------------------------------------------------------
// API live layer (mounted by route)
// ---------------------------------------------------------------------------
// Only the middlewares are provided statically here — both are request-scoped by
// construction (each value is a per-request effect that reads the injected
// AppContext via `serviceOption`). `EnvMiddleware` supplies `CloudflareEnv` so
// the handlers' env-derived graph (`RequestServicesLive`) resolves; `BetterAuth`
// supplies `AuthenticatedUser`. All DB/Clockin services are provided per request
// inside the handlers via `RequestServicesLive`, so they don't appear here.

export const ApiV1GroupLive = HttpApiBuilder.api(ApiV1Group).pipe(
  Layer.provide(
    ClockinApiGroupLive.pipe(
      Layer.provide(BetterAuthMiddlewareLive),
      Layer.provide(EnvMiddlewareLive)
    )
  ),
  Layer.provide(
    ConnectionsApiGroupLive.pipe(
      Layer.provide(BetterAuthMiddlewareLive),
      Layer.provide(EnvMiddlewareLive)
    )
  )
)
