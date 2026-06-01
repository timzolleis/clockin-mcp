import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import { McpServer as OriginalMcpServer } from "@modelcontextprotocol/sdk/server/mcp"
import type { JWTPayload } from "better-auth"
import { verifyJwsAccessToken } from "better-auth/oauth2"
import { Cause, Context, Effect, Layer, ManagedRuntime } from "effect"
import { createMcpHandler } from "mcp-handler"
import type { AppLoadContext } from "react-router"
import { z } from "zod"
import { AuthService } from "~/lib/auth"
import { provideAuth } from "~/lib/auth-effect.server"
import { ClockinCredentialsService } from "~/features/clockin/credentials/credentials-service"
import { ServicesLive } from "~/features/clockin/router/request-services.server"
import { CurrentClockinCredentials } from "~/features/clockin/client"
import {
  ClockinCorrections,
  ClockinEvents,
  ClockinProjects,
  ClockinStatus,
  ClockinTimesheets,
  ClockinWorkdays,
  currentDay,
  formatDuration,
  projectsPhrase,
  summarizeDay,
  TaskId,
} from "~/features/clockin/service"
import { CredentialsNotFoundError, UserId } from "~/lib/domain/credentials"
import { ProjectDateId, ProjectId } from "~/lib/domain/project"
import { SliceId } from "~/lib/domain/workday"
import type { ClockableTaskId } from "~/lib/domain/task"
import { cloudflareEnvLayer } from "~/lib/effect/cloudflare-env"
import { DatabaseLive } from "~/lib/effect/db"
import {
  confirmWidget,
  projectsWidget,
  registerWidgetResources,
  statusWidget,
  timeOverviewWidget,
  workdaysWidget,
} from "~/lib/mcp/widgets"

// ---------------------------------------------------------------------------
// Per-request value tags
// ---------------------------------------------------------------------------
// The live MCP server instance and the verified JWT are request-scoped values
// the SDK hands us imperatively. Modeling them as tags lets tool registration
// be an effect that simply yields what it needs.

export class McpServer extends Context.Tag("McpServer")<
  McpServer,
  OriginalMcpServer
>() {}

export class McpJwt extends Context.Tag("McpJwt")<McpJwt, JWTPayload>() {}

// ---------------------------------------------------------------------------
// CallToolResult shaping
// ---------------------------------------------------------------------------

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
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

const NOT_CONFIGURED = text(
  "No Clockin credentials configured. Visit /settings to connect your account.",
)

// The task vocabulary the correction tools expose, mapped to upstream task ids.
const TASK_BY_NAME = {
  work: TaskId.WORK,
  project: TaskId.PROJECT,
  break: TaskId.BREAK,
  drive: TaskId.DRIVE,
  load: TaskId.LOAD,
  duty: TaskId.DUTY,
} as const satisfies Record<string, ClockableTaskId>

const TASK_NAMES = ["work", "project", "break", "drive", "load", "duty"] as const

/** Fold the human duration inputs into seconds. */
const toSeconds = (hours?: number, minutes?: number) =>
  Math.round((hours ?? 0) * 3600 + (minutes ?? 0) * 60)

// ---------------------------------------------------------------------------
// transformErrors — the single, total error→text boundary
// ---------------------------------------------------------------------------
// Turns any tool effect into a CallToolResult and never fails:
//   • success                  → text(value)
//   • CredentialsNotFoundError → friendly "not configured" message
//   • any other typed error    → errorText (the documented upstream failures)
//   • defects                  → errorText via Cause.squash (the onlyClockinErrors
//                                `die` cases: transport, decode, undocumented status)
// `CredentialsNotFoundError` rides the typed error channel rather than being
// caught at the credential boundary, so it stays visible and type-safe here.
const transformErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.map(text),
    Effect.catchAll((error) =>
      Effect.succeed(
        error instanceof CredentialsNotFoundError
          ? NOT_CONFIGURED
          : errorText(error),
      ),
    ),
    Effect.catchAllCause((cause) => Effect.succeed(errorText(Cause.squash(cause)))),
  )

// Load + decrypt the current user's credentials and provide them to `effect`.
// On a missing config this fails with `CredentialsNotFoundError` — left in the
// channel for `transformErrors` to render, not caught here.
const withCredentials =
  (userId: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentClockinCredentials>) =>
    ClockinCredentialsService.pipe(
      Effect.flatMap((service) =>
        service.getCredentials({ userId: UserId.make(userId) }),
      ),
      Effect.flatMap((credentials) =>
        Effect.provideService(effect, CurrentClockinCredentials, credentials),
      ),
    )

// ---------------------------------------------------------------------------
// Tool registration (effectful)
// ---------------------------------------------------------------------------
// Reads the server + jwt from context and registers every tool. The only bridge
// to Promise land is `run`, which threads credentials in, renders errors via
// `transformErrors`, and runs on the per-request runtime. Each tool body is a
// single effect — no try/catch, no configured/not-configured branching.

// The whole service graph, wired ONCE at module load. Its only type-level
// dependency is `CloudflareEnv` — injected per env in `buildRuntime`.
const McpServicesLive = ServicesLive.pipe(Layer.provideMerge(DatabaseLive))

type ToolContext = Layer.Layer.Success<typeof McpServicesLive>
type ToolRuntime = ManagedRuntime.ManagedRuntime<ToolContext, never>

const registerTools = (runtime: ToolRuntime) =>
  Effect.gen(function* () {
    const server = yield* McpServer
    const jwt = yield* McpJwt
    const userId = String(jwt.sub)

    // The sole Effect→Promise bridge for tool invocations. `R` is pinned to the
    // runtime's own service graph, minus the per-request credentials which `run`
    // supplies itself.
    const run = <A, E, R extends ToolContext>(
      effect: Effect.Effect<A, E, R | CurrentClockinCredentials>,
    ) =>
      runtime.runPromise(transformErrors(withCredentials(userId)(effect)))

    // After an action posts its event, read today's workday back so the result
    // can carry a ready-to-speak summary ("7h 48m logged today across 2
    // projects"). Best-effort: a failed read degrades to `null` rather than
    // failing the action that already succeeded. Project names resolve through
    // the workdays service, so a just-started project appears here by name.
    const today = ClockinWorkdays.pipe(
      Effect.flatMap((w) => w.summaries()),
      Effect.map((s) => summarizeDay(currentDay(s))),
      Effect.catchAll(() => Effect.succeed(null)),
    )

    // Every widget's HTML resource, registered once. Tools below opt in by
    // pointing `_meta.ui.resourceUri` at the matching `*.uri`.
    registerWidgetResources(server)

    registerAppTool(
      server,
      "current_status",
      {
        description:
          "What am I currently doing? Returns a human-readable description plus structured fields: state ('working' | 'on_break' | 'working_on_project' | 'clocked_out' | ...), since (ISO timestamp), forSeconds, and project ({id,name}) when working on one. Self-contained — no extra lookups needed to answer 'what am I doing right now?'.",
        inputSchema: {},
        _meta: { ui: { resourceUri: statusWidget.uri } },
      },
      () => run(Effect.flatMap(ClockinStatus, (s) => s.current())),
    )

    registerAppTool(
      server,
      "clock_in",
      {
        description:
          "Start the workday — clock in. Returns { message, clockedInAt (ISO), today, display }. `message` is a ready confirmation; `today` carries the day's totals so far. Speak `message` back to the user.",
        inputSchema: {},
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      () =>
        run(
          Effect.gen(function* () {
            const events = yield* ClockinEvents
            const at = new Date().toISOString()
            yield* events.clockIn()
            const day = yield* today
            const resumed = day != null && day.workedSeconds > 0
            const message = resumed
              ? `Clocked in — ${day.worked} already logged today.`
              : "Clocked in. Your workday is running."
            const detail = resumed
              ? `${day.worked} already logged today.`
              : "Your workday is running."
            return {
              message,
              clockedInAt: at,
              today: day,
              display: { tone: "good", title: "Clocked in", at, detail },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "clock_out",
      {
        description:
          "End the workday — clock out. Returns { message, clockedOutAt (ISO), today: { worked, workedSeconds, onBreak, clockedIn, projects[], projectCount }, display }. `message` already reads e.g. 'Clocked out — 7h 48m logged today across 2 projects.' — speak it back.",
        inputSchema: {},
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      () =>
        run(
          Effect.gen(function* () {
            const events = yield* ClockinEvents
            const at = new Date().toISOString()
            yield* events.clockOut()
            const day = yield* today
            const logged = day != null && day.workedSeconds > 0
            const phrase = day ? projectsPhrase(day.projectCount) : ""
            const message = logged
              ? `Clocked out — ${day.worked} logged today${phrase}.`
              : "Clocked out."
            const detail = logged
              ? `${day.worked} logged today${phrase}.`
              : "Workday ended."
            return {
              message,
              clockedOutAt: at,
              today: day,
              display: { tone: "good", title: "Clocked out", at, detail },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "start_break",
      {
        description:
          "Begin a break. Time stops counting as work. Returns { message, breakStartedAt (ISO), today, display }. Speak `message` back.",
        inputSchema: {},
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      () =>
        run(
          Effect.gen(function* () {
            const events = yield* ClockinEvents
            const at = new Date().toISOString()
            yield* events.startBreak()
            const day = yield* today
            const logged = day != null && day.workedSeconds > 0
            const message = logged
              ? `Break started — ${day.worked} logged so far today. The clock is paused.`
              : "Break started. The clock is paused."
            const detail = logged
              ? `${day.worked} logged so far. Time stops counting until you're back.`
              : "Time stops counting as work until you're back."
            return {
              message,
              breakStartedAt: at,
              today: day,
              display: { tone: "iris", title: "Break started", at, detail },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "resume_work",
      {
        description:
          "Return from a break (or any non-work task) to general work time. Returns { message, resumedAt (ISO), away: { duration, seconds, since } | null, today, display }. When you were on a break, `message` reads e.g. 'Back to work — you were away for 42m.' — speak it back.",
        inputSchema: {},
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      () =>
        run(
          Effect.gen(function* () {
            const status = yield* ClockinStatus
            const events = yield* ClockinEvents
            // Capture the break length BEFORE resuming — accurate regardless of
            // read-back consistency. Best-effort: a failed read just drops it.
            const before = yield* status
              .current()
              .pipe(Effect.catchAll(() => Effect.succeed(null)))
            const at = new Date().toISOString()
            yield* events.resumeWork()
            const day = yield* today
            const away =
              before != null && before.state === "on_break"
                ? {
                    since: before.since,
                    seconds: before.forSeconds,
                    duration: formatDuration(before.forSeconds),
                  }
                : null
            const message = away
              ? `Back to work — you were away for ${away.duration}.`
              : "Back to work."
            const detail = away
              ? `You were away for ${away.duration}.`
              : "Welcome back."
            return {
              message,
              resumedAt: at,
              away,
              today: day,
              display: { tone: "good", title: "Back to work", at, detail },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "start_project_work",
      {
        description:
          "Start working on a specific project. Clocks in first if you're " +
          "clocked out, then attaches the project; if you're already clocked " +
          "in it just switches to the project. Use `list_projects` first to " +
          "find the project_id. Returns { message, project: { id, name }, " +
          "startedAt (ISO), today, display } — speak `message` back.",
        inputSchema: {
          project_id: z.number().int().positive(),
          project_date_id: z.number().int().positive().optional(),
        },
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      ({ project_id, project_date_id }) =>
        run(
          Effect.gen(function* () {
            const status = yield* ClockinStatus
            const events = yield* ClockinEvents
            const current = yield* status.current()
            const wasClockedOut = current.state === "clocked_out"
            const projectId = ProjectId.make(project_id)
            const projectDateId =
              project_date_id != null
                ? ProjectDateId.make(project_date_id)
                : undefined
            const at = new Date().toISOString()
            if (wasClockedOut) {
              yield* events.clockInAndSwitchToProject(projectId, projectDateId)
            } else {
              yield* events.switchToProject(projectId, projectDateId)
            }
            const day = yield* today
            const name =
              day?.projects.find((p) => p.id === project_id)?.name ?? null
            const label = name ? `"${name}"` : `project ${project_id}`
            const message = wasClockedOut
              ? `Clocked in and started working on ${label}.`
              : `Now tracking ${label}.`
            const detail = wasClockedOut
              ? "Workday opened with the project attached."
              : "Switched your active project."
            return {
              message,
              project: { id: project_id, name },
              startedAt: at,
              today: day,
              display: {
                tone: "good",
                title: name ? `Now tracking · ${name}` : "Now tracking project",
                at,
                detail,
              },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "list_projects",
      {
        description:
          "List projects. Optionally filter by a substring query. Returns an array of { id, name }.",
        inputSchema: { query: z.string().optional() },
        _meta: { ui: { resourceUri: projectsWidget.uri } },
      },
      ({ query }) =>
        run(
          Effect.flatMap(ClockinProjects, (p) =>
            query ? p.search(query) : p.list(),
          ),
        ),
    )

    registerAppTool(
      server,
      "list_workdays",
      {
        description:
          "Recent workdays rolled up per day with durations and totals. Each entry has: date, startedAt/endedAt, ongoing, segments (each with type, project, startedAt/endedAt, durationSeconds), and totals { clockedInSeconds, workSeconds, breakSeconds, perProject }. Sufficient to answer 'how much have I worked today / on project X' without any further math.",
        inputSchema: {},
        _meta: { ui: { resourceUri: workdaysWidget.uri } },
      },
      () => run(Effect.flatMap(ClockinWorkdays, (w) => w.summaries())),
    )

    registerAppTool(
      server,
      "time_overview",
      {
        description:
          "One-call time balance overview: { currentWeek: { weekStarting, workedHours, targetHours, remainingHours }, currentMonth: { workedHours, targetHours, remainingHours, overtimeHours }, annualFlextimeHours, used/planned/max vacation days }. Hours are decimals (e.g. 7.5 = 7h30m). Sufficient to answer 'how much have I worked this week / month, how much do I still need, what's my flextime / vacation'.",
        inputSchema: {},
        _meta: { ui: { resourceUri: timeOverviewWidget.uri } },
      },
      () => run(Effect.flatMap(ClockinTimesheets, (t) => t.overview())),
    )

    registerAppTool(
      server,
      "restructure_workday",
      {
        description:
          "Re-split a day's WORKED time across projects by percentage — e.g. " +
          "'make today 20% A, 30% B, 50% C'. The server keeps the day's total " +
          "worked time fixed and redistributes it into the buckets (length " +
          "unchanged; breaks are not carried over). Each bucket: { task " +
          "(default 'project'), project_id (required for 'project'), percent }. " +
          "Use list_projects for ids. Returns { message, today, transactionIds, " +
          "display } — speak `message` back.",
        inputSchema: {
          date: z.string().optional(),
          buckets: z
            .array(
              z.object({
                task: z.enum(TASK_NAMES).default("project"),
                project_id: z.number().int().positive().optional(),
                percent: z.number().positive(),
              }),
            )
            .min(1),
        },
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      ({ date, buckets }) =>
        run(
          Effect.gen(function* () {
            const corrections = yield* ClockinCorrections
            const at = new Date().toISOString()
            const result = yield* corrections.restructureDay({
              date,
              buckets: buckets.map((b) => ({
                taskId: TASK_BY_NAME[b.task],
                projectId: b.project_id != null ? ProjectId.make(b.project_id) : null,
                weight: b.percent,
              })),
            })
            const day = result.day
            const message = day
              ? `Restructured your day — ${day.worked} logged${projectsPhrase(day.projectCount)}.`
              : "Day restructured."
            return {
              message,
              today: day,
              transactionIds: result.transactionIds,
              display: {
                tone: "good",
                title: "Day restructured",
                at,
                detail: day ? `${day.worked} across ${day.projectCount} projects.` : "",
              },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "adjust_slice",
      {
        description:
          "Resize one existing time slice. Get the slice's `id` from " +
          "list_workdays (each segment carries one). `op: 'set'` makes it that " +
          "length; `op: 'add'` grows it by the amount. The rest of the day " +
          "ripples — e.g. 'set' elternportal to 1h moves the clock-out earlier. " +
          "Pass `hours` and/or `minutes`. Returns { message, today, " +
          "transactionIds, display } — speak `message` back.",
        inputSchema: {
          slice_id: z.string(),
          op: z.enum(["set", "add"]).default("set"),
          hours: z.number().nonnegative().optional(),
          minutes: z.number().nonnegative().optional(),
        },
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      ({ slice_id, op, hours, minutes }) =>
        run(
          Effect.gen(function* () {
            const corrections = yield* ClockinCorrections
            const at = new Date().toISOString()
            const seconds = toSeconds(hours, minutes)
            const result = yield* corrections.editSlice({
              sliceId: SliceId.make(slice_id),
              op,
              seconds,
            })
            const day = result.day
            const message =
              op === "set"
                ? `Set that slice to ${formatDuration(seconds)}.`
                : `Added ${formatDuration(seconds)} to that slice.`
            return {
              message,
              today: day,
              transactionIds: result.transactionIds,
              display: {
                tone: "good",
                title: op === "set" ? "Slice updated" : "Slice extended",
                at,
                detail: day ? `${day.worked} logged today.` : "",
              },
            }
          }),
        ),
    )

    registerAppTool(
      server,
      "append_slice",
      {
        description:
          "Add a new slice at the END of a day, extending it — e.g. 'I " +
          "finished with 35 mins of elternportal'. Fields: { date?, task " +
          "(default 'project'), project_id (required for 'project'), hours?, " +
          "minutes? }. Use list_projects for ids. Returns { message, today, " +
          "transactionIds, display } — speak `message` back.",
        inputSchema: {
          date: z.string().optional(),
          task: z.enum(TASK_NAMES).default("project"),
          project_id: z.number().int().positive().optional(),
          hours: z.number().nonnegative().optional(),
          minutes: z.number().nonnegative().optional(),
        },
        _meta: { ui: { resourceUri: confirmWidget.uri } },
      },
      ({ date, task, project_id, hours, minutes }) =>
        run(
          Effect.gen(function* () {
            const corrections = yield* ClockinCorrections
            const at = new Date().toISOString()
            const seconds = toSeconds(hours, minutes)
            const result = yield* corrections.appendSlice({
              date,
              taskId: TASK_BY_NAME[task],
              projectId: project_id != null ? ProjectId.make(project_id) : null,
              seconds,
            })
            const day = result.day
            const message = `Added ${formatDuration(seconds)} to the end of your day.`
            return {
              message,
              today: day,
              transactionIds: result.transactionIds,
              display: {
                tone: "good",
                title: "Slice added",
                at,
                detail: day ? `${day.worked} logged today.` : "",
              },
            }
          }),
        ),
    )
  })

// ---------------------------------------------------------------------------
// Runtime — the outermost effect boundary
// ---------------------------------------------------------------------------
// Take the module-static service graph and inject the single env-derived leaf:
// `CloudflareEnv` (the D1 binding + secrets + base URLs are all derived from
// it). Workers reuse one isolate per env, so the runtime is built once per env
// and cached by env identity.

const buildRuntime = (env: Env): ToolRuntime =>
  ManagedRuntime.make(McpServicesLive.pipe(Layer.provide(cloudflareEnvLayer(env))))

const runtimeCache = new WeakMap<Env, ToolRuntime>()

const runtimeFor = (env: Env): ToolRuntime => {
  const cached = runtimeCache.get(env)
  if (cached) return cached
  const runtime = buildRuntime(env)
  runtimeCache.set(env, runtime)
  return runtime
}

const handlerCache = new WeakMap<Env, (request: Request) => Promise<Response>>()

export const getMcpHandler = (
  context: AppLoadContext,
): ((request: Request) => Promise<Response>) => {
  const env = context.cloudflare.env
  const cached = handlerCache.get(env)
  if (cached) return cached

  const runtime = runtimeFor(env)
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "")
  const mcpResource = `${baseUrl}/mcp`
  const authIssuer = `${baseUrl}/api/auth`

  // Read the signing keys IN-PROCESS straight from D1 (via the jwt plugin),
  // never over HTTP. A Worker subrequest to its own public hostname — which is
  // what fetching `${authIssuer}/jwks` would be — fails at the edge and surfaces
  // as `Jwks failed: <none>`, so token verification could never succeed in prod.
  const jwks = () =>
    Effect.runPromise(
      provideAuth(env)(
        Effect.flatMap(AuthService, (auth) =>
          Effect.promise(() => auth.api.getJwks()),
        ),
      ),
    )

  // 401 challenge pointing MCP clients at our protected-resource metadata so
  // they can discover the OAuth server and (re)authenticate. Mirrors the header
  // `@better-auth/oauth-provider`'s `mcpHandler` produced.
  const resourceUrl = new URL(mcpResource)
  const challenge =
    `Bearer resource_metadata="${resourceUrl.origin}` +
    `/.well-known/oauth-protected-resource${resourceUrl.pathname}"`
  const unauthorized = (message: string) =>
    new Response(message, {
      status: 401,
      headers: { "WWW-Authenticate": challenge },
    })

  // Verify the bearer token locally against those keys, then hand off to the
  // MCP transport. The inner registration is a synchronous effect: it only
  // reads the two request-scoped tags and wires callbacks (which bridge to the
  // runtime lazily, per invocation).
  const dispatch = (req: Request, jwt: JWTPayload) =>
    createMcpHandler(
      (server) =>
        Effect.runSync(
          registerTools(runtime).pipe(
            Effect.provideService(McpServer, server),
            Effect.provideService(McpJwt, jwt),
          ),
        ),
      { serverInfo: { name: "clockin-mcp", version: "0.1.0" } },
      { basePath: "/", verboseLogs: baseUrl.includes("localhost") },
    )(req)

  const handler = async (request: Request): Promise<Response> => {
    const authorization = request.headers.get("authorization") ?? undefined
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : authorization
    if (!token) return unauthorized("missing authorization header")

    let jwt: JWTPayload
    try {
      jwt = await verifyJwsAccessToken(token, {
        jwksFetch: jwks,
        verifyOptions: { issuer: authIssuer, audience: mcpResource },
      })
    } catch {
      // Expired / invalid / wrong issuer or audience — re-challenge so the
      // client re-runs the OAuth flow.
      return unauthorized("invalid token")
    }

    return dispatch(request, jwt)
  }

  handlerCache.set(env, handler)
  return handler
}
