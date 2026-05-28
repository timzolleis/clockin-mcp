import { HttpApiBuilder } from "@effect/platform"
import { eq } from "drizzle-orm"
import { Effect, Layer, Redacted } from "effect"
import { userToken } from "~/lib/db/schema"
import {
  ClockinAuth,
  ClockinEmployee,
  ClockinEvents,
  ClockinProjects,
  ClockinStatus,
  ClockinTimesheets,
  ClockinTokens,
  ClockinWorkdays,
} from "~/lib/effect/clockin"
import { Database } from "~/lib/effect/db"
import { EncryptedToken, TokenVault } from "~/lib/effect/vault"
import { ApiV1Group } from "~/lib/api/api-v1-group"
import {
  ConfigurationStatus,
  OkResult,
  SetupResult,
} from "~/lib/api/clockin-api-group"
import { AuthenticatedUser } from "~/lib/api/middleware/auth-middleware"
import {
  NotConfiguredError,
  UpstreamError,
  mapServerError,
} from "~/lib/api/errors"
import { BetterAuthMiddlewareLive } from "~/lib/api/middleware/better-auth-middleware.server"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const loadRow = (userId: string) =>
  Effect.flatMap(Database, (db) =>
    Effect.promise(() =>
      db
        .select()
        .from(userToken)
        .where(eq(userToken.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ),
  )

const requireTokens = Effect.gen(function* () {
  const user = yield* AuthenticatedUser
  const vault = yield* TokenVault
  const row = yield* loadRow(user.id)
  if (!row) {
    return yield* new NotConfiguredError({
      message: "Visit /settings to connect your Clockin account.",
    })
  }
  const userTokenPlain = yield* vault.decrypt(
    new EncryptedToken({
      ciphertext: row.userCiphertext,
      iv: row.userIv,
      authTag: row.userAuthTag,
    }),
  )
  const deviceTokenPlain = yield* vault.decrypt(
    new EncryptedToken({
      ciphertext: row.deviceCiphertext,
      iv: row.deviceIv,
      authTag: row.deviceAuthTag,
    }),
  )
  return {
    userToken: Redacted.make(userTokenPlain),
    deviceToken: Redacted.make(deviceTokenPlain),
    employeeId: row.employeeId,
  }
})

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
        }),
    ),
  )

// ---------------------------------------------------------------------------
// Handler layer
// ---------------------------------------------------------------------------

export const ClockinApiGroupLive = HttpApiBuilder.group(
  ApiV1Group,
  "clockin",
  (handlers) =>
    Effect.gen(function* () {
      const auth = yield* ClockinAuth
      const empSvc = yield* ClockinEmployee
      const events = yield* ClockinEvents
      const projects = yield* ClockinProjects
      const status = yield* ClockinStatus
      const timesheets = yield* ClockinTimesheets
      const workdays = yield* ClockinWorkdays
      const vault = yield* TokenVault

      const withTokens = <A, E, R>(
        eff: Effect.Effect<A, E, R | ClockinTokens>,
      ) =>
        Effect.flatMap(requireTokens, (tokens) =>
          eff.pipe(Effect.provideService(ClockinTokens, tokens)),
        )

      return handlers
        .handle("status", () =>
          mapServerError(
            Effect.gen(function* () {
              const user = yield* AuthenticatedUser
              const row = yield* loadRow(user.id)
              const ts = row?.updatedAt
              const updatedAt =
                ts instanceof Date && !Number.isNaN(ts.getTime()) ? ts : null
              return new ConfigurationStatus({
                configured: !!row,
                employeeId: row?.employeeId ?? null,
                updatedAt,
              })
            }),
          ),
        )
        .handle("setup", ({ payload }) =>
          mapServerError(
            intoUpstreamError(
              Effect.gen(function* () {
              const user = yield* AuthenticatedUser
              const loginData = yield* auth.login(
                payload.email,
                payload.password,
              )
              // /device/employees returns the employees this device is
              // allowed to post events for. For personal accounts it's a
              // single entry — its `id` is the employee_id /events/storeMany
              // expects. /device/config.user_id is a USER id, not employee id,
              // and the events endpoint rejects it with 422.
              const employees = yield* empSvc.employees().pipe(
                Effect.provideService(ClockinTokens, {
                  userToken: Redacted.make(loginData.user_token),
                  deviceToken: Redacted.make(loginData.device_token),
                  employeeId: 0,
                }),
              )
              const fromEmployees = employees[0]?.id ?? null
              const fromOverride = payload.employeeIdOverride ?? null
              const employeeId = fromOverride ?? fromEmployees
              if (
                employeeId == null ||
                !Number.isFinite(employeeId) ||
                employeeId <= 0
              ) {
                return yield* new UpstreamError({
                  message: `Login succeeded but /device/employees returned no usable employee_id. Got: ${JSON.stringify(employees)}. Provide employeeIdOverride.`,
                })
              }
              const u = yield* vault.encrypt(loginData.user_token)
              const d = yield* vault.encrypt(loginData.device_token)
              const now = new Date()
              const db = yield* Database
              yield* Effect.promise(() =>
                db
                  .insert(userToken)
                  .values({
                    userId: user.id,
                    userCiphertext: u.ciphertext,
                    userIv: u.iv,
                    userAuthTag: u.authTag,
                    deviceCiphertext: d.ciphertext,
                    deviceIv: d.iv,
                    deviceAuthTag: d.authTag,
                    employeeId,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .onConflictDoUpdate({
                    target: userToken.userId,
                    set: {
                      userCiphertext: u.ciphertext,
                      userIv: u.iv,
                      userAuthTag: u.authTag,
                      deviceCiphertext: d.ciphertext,
                      deviceIv: d.iv,
                      deviceAuthTag: d.authTag,
                      employeeId,
                      updatedAt: now,
                    },
                  }),
              )
              return new SetupResult({
                employeeId,
                autoDetected: fromOverride == null && fromEmployees != null,
              })
              }),
            ),
          ),
        )
        .handle("current", () =>
          mapServerError(intoUpstreamError(withTokens(status.current()))),
        )
        .handle("workdays", () =>
          mapServerError(intoUpstreamError(withTokens(workdays.summaries()))),
        )
        .handle("overview", () =>
          mapServerError(intoUpstreamError(withTokens(timesheets.overview()))),
        )
        .handle("projects", ({ payload }) =>
          mapServerError(
            intoUpstreamError(
              withTokens(
                payload.query ? projects.search(payload.query) : projects.list(),
              ),
            ),
          ),
        )
        .handle("clockIn", () =>
          mapServerError(
            intoUpstreamError(withTokens(events.clockIn())).pipe(
              Effect.as(new OkResult({ ok: true })),
            ),
          ),
        )
        .handle("clockOut", () =>
          mapServerError(
            intoUpstreamError(withTokens(events.clockOut())).pipe(
              Effect.as(new OkResult({ ok: true })),
            ),
          ),
        )
        .handle("startBreak", () =>
          mapServerError(
            intoUpstreamError(withTokens(events.startBreak())).pipe(
              Effect.as(new OkResult({ ok: true })),
            ),
          ),
        )
        .handle("resumeWork", () =>
          mapServerError(
            intoUpstreamError(withTokens(events.resumeWork())).pipe(
              Effect.as(new OkResult({ ok: true })),
            ),
          ),
        )
        .handle("startProject", ({ payload }) =>
          mapServerError(
            intoUpstreamError(
              withTokens(
                events.startProject(
                  payload.projectId,
                  payload.projectDateId ?? undefined,
                ),
              ),
            ).pipe(Effect.as(new OkResult({ ok: true }))),
          ),
        )
    }),
)

// ---------------------------------------------------------------------------
// API live layer (mounted by route)
// ---------------------------------------------------------------------------

const ClockinServicesLive = Layer.mergeAll(
  ClockinAuth.Default,
  ClockinEmployee.Default,
  ClockinEvents.Default,
  ClockinProjects.Default,
  ClockinStatus.Default,
  ClockinTimesheets.Default,
  ClockinWorkdays.Default,
)

export const ApiV1GroupLive = HttpApiBuilder.api(ApiV1Group).pipe(
  Layer.provide(
    ClockinApiGroupLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockinServicesLive,
          Database.Live,
          TokenVault.Default,
          BetterAuthMiddlewareLive,
        ),
      ),
    ),
  ),
)
