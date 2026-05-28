import { mcpHandler } from "@better-auth/oauth-provider"
import { createMcpHandler } from "mcp-handler"
import { eq } from "drizzle-orm"
import { Config, Effect, Redacted } from "effect"
import { z } from "zod"
import { userToken } from "~/lib/db/schema"
import { serverRuntime, type ServerServices } from "~/lib/effect/runtime"
import { Database } from "~/lib/effect/db"
import { EncryptedToken, TokenVault } from "~/lib/effect/vault"
import {
  ClockinEvents,
  ClockinProjects,
  ClockinStatus,
  ClockinTimesheets,
  ClockinTokens,
  ClockinWorkdays,
} from "~/lib/effect/clockin"
import type { Route } from "./+types/api.mcp"

const baseUrl = Effect.runSync(Config.string("BETTER_AUTH_URL"))
const mcpResource = `${baseUrl}/mcp`
const authIssuer = `${baseUrl}/api/auth`

const NOT_CONFIGURED = {
  content: [
    {
      type: "text" as const,
      text: "No Clockin credentials configured. Visit /settings to add your tokens.",
    },
  ],
}

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text:
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
})

const errorText = (err: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: err instanceof Error ? err.message : JSON.stringify(err),
    },
  ],
})

// Load + decrypt this user's stored tokens via the server runtime. Returns
// null if the user hasn't configured Clockin yet.
const loadTokens = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    const vault = yield* TokenVault
    const row = yield* Effect.promise(() =>
      db
        .select()
        .from(userToken)
        .where(eq(userToken.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
    )
    if (!row) return null
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

const run = async <A, E>(
  userId: string,
  effect: Effect.Effect<A, E, ServerServices | ClockinTokens>,
) =>
  serverRuntime.runPromise(
    Effect.gen(function* () {
      const tokens = yield* loadTokens(userId)
      if (!tokens) return { configured: false as const }
      const value = yield* effect.pipe(
        Effect.provideService(ClockinTokens, tokens),
      )
      return { configured: true as const, value }
    }),
  )

const handler = mcpHandler(
  {
    jwksUrl: `${authIssuer}/jwks`,
    verifyOptions: {
      issuer: authIssuer,
      audience: mcpResource,
    },
  },
  (req, jwt) =>
    createMcpHandler(
      (server) => {
        const userId = String(jwt.sub)

        // ---------- Status ----------
        server.registerTool(
          "current_status",
          {
            description:
              "What am I currently doing? Returns a human-readable description plus structured fields: state ('working' | 'on_break' | 'working_on_project' | 'clocked_out' | ...), since (ISO timestamp), and project ({id,name}) when working on one. Self-contained — no extra lookups needed to answer 'what am I doing right now?'.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinStatus, (s) => s.current()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text(r.value)
            } catch (err) {
              return errorText(err)
            }
          },
        )

        // ---------- Clocking ----------
        server.registerTool(
          "clock_in",
          {
            description: "Start the workday — clock in.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinEvents, (e) => e.clockIn()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text("Clocked in.")
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "clock_out",
          {
            description: "End the workday — clock out.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinEvents, (e) => e.clockOut()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text("Clocked out.")
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "start_break",
          {
            description: "Begin a break. Time stops counting as work.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinEvents, (e) => e.startBreak()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text("Break started.")
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "resume_work",
          {
            description:
              "Return from a break (or any non-work task) to general work time.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinEvents, (e) => e.resumeWork()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text("Back to work.")
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "start_project_work",
          {
            description:
              "Switch to working on a specific project. Use `list_projects` first to find the project_id.",
            inputSchema: {
              project_id: z.number().int().positive(),
              project_date_id: z.number().int().positive().optional(),
            },
          },
          async ({ project_id, project_date_id }) => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinEvents, (e) =>
                  e.startProject(project_id, project_date_id),
                ),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text(`Started working on project ${project_id}.`)
            } catch (err) {
              return errorText(err)
            }
          },
        )

        // ---------- Reads ----------
        server.registerTool(
          "list_projects",
          {
            description:
              "List projects. Optionally filter by a substring query. Returns project ids and names.",
            inputSchema: { query: z.string().optional() },
          },
          async ({ query }) => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinProjects, (p) =>
                  query ? p.search(query) : p.list(),
                ),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text(r.value)
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "list_workdays",
          {
            description:
              "Recent workdays rolled up per day with durations and totals. Each entry has: date, startedAt/endedAt, ongoing, segments (each with type, project, startedAt/endedAt, durationSeconds), and totals { clockedInSeconds, workSeconds, breakSeconds, perProject }. Sufficient to answer 'how much have I worked today / on project X' without any further math.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinWorkdays, (w) => w.summaries()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text(r.value)
            } catch (err) {
              return errorText(err)
            }
          },
        )

        server.registerTool(
          "time_overview",
          {
            description:
              "One-call time balance overview: { currentWeek: { weekStarting, workedHours, targetHours, remainingHours }, currentMonth: { workedHours, targetHours, remainingHours, overtimeHours }, annualFlextimeHours, used/planned/max vacation days }. Hours are decimals (e.g. 7.5 = 7h30m). Sufficient to answer 'how much have I worked this week / month, how much do I still need, what's my flextime / vacation'.",
            inputSchema: {},
          },
          async () => {
            try {
              const r = await run(
                userId,
                Effect.flatMap(ClockinTimesheets, (t) => t.overview()),
              )
              if (!r.configured) return NOT_CONFIGURED
              return text(r.value)
            } catch (err) {
              return errorText(err)
            }
          },
        )
      },
      {
        serverInfo: { name: "clockin-mcp", version: "0.1.0" },
      },
      {
        basePath: "/",
        verboseLogs: baseUrl.includes("localhost"),
      },
    )(req),
)

export const loader = ({ request }: Route.LoaderArgs) => handler(request)
export const action = ({ request }: Route.ActionArgs) => handler(request)
