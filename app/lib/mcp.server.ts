import { mcpHandler } from "@better-auth/oauth-provider"
import { McpServer as OriginalMcpServer } from "@modelcontextprotocol/sdk/server/mcp"
import type { JWTPayload } from "better-auth"
import { Cause, Context, Effect, Layer, ManagedRuntime } from "effect"
import { createMcpHandler } from "mcp-handler"
import type { AppLoadContext } from "react-router"
import { z } from "zod"
import { ClockinCredentialsService } from "~/features/clockin/credentials/credentials-service"
import { ServicesLive } from "~/features/clockin/router/request-services.server"
import { CurrentClockinCredentials } from "~/features/clockin/service/clockin-client"
import { ClockinEvents } from "~/features/clockin/service/clockin-events"
import { ClockinProjects } from "~/features/clockin/service/clockin-projects"
import { ClockinStatus } from "~/features/clockin/service/clockin-status"
import { ClockinTimesheets } from "~/features/clockin/service/clockin-timesheets"
import { ClockinWorkdays } from "~/features/clockin/service/clockin-workdays"
import { CredentialsNotFoundError, UserId } from "~/lib/domain/credentials"
import { ProjectDateId, ProjectId } from "~/lib/domain/project"
import { cloudflareEnvLayer } from "~/lib/effect/cloudflare-env"
import { DatabaseLive } from "~/lib/effect/db"

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

    server.registerTool(
      "current_status",
      {
        description:
          "What am I currently doing? Returns a human-readable description plus structured fields: state ('working' | 'on_break' | 'working_on_project' | 'clocked_out' | ...), since (ISO timestamp), and project ({id,name}) when working on one. Self-contained — no extra lookups needed to answer 'what am I doing right now?'.",
        inputSchema: {},
      },
      () => run(Effect.flatMap(ClockinStatus, (s) => s.current())),
    )

    server.registerTool(
      "clock_in",
      { description: "Start the workday — clock in.", inputSchema: {} },
      () =>
        run(
          Effect.flatMap(ClockinEvents, (e) => e.clockIn()).pipe(
            Effect.as("Clocked in."),
          ),
        ),
    )

    server.registerTool(
      "clock_out",
      { description: "End the workday — clock out.", inputSchema: {} },
      () =>
        run(
          Effect.flatMap(ClockinEvents, (e) => e.clockOut()).pipe(
            Effect.as("Clocked out."),
          ),
        ),
    )

    server.registerTool(
      "start_break",
      {
        description: "Begin a break. Time stops counting as work.",
        inputSchema: {},
      },
      () =>
        run(
          Effect.flatMap(ClockinEvents, (e) => e.startBreak()).pipe(
            Effect.as("Break started."),
          ),
        ),
    )

    server.registerTool(
      "resume_work",
      {
        description:
          "Return from a break (or any non-work task) to general work time.",
        inputSchema: {},
      },
      () =>
        run(
          Effect.flatMap(ClockinEvents, (e) => e.resumeWork()).pipe(
            Effect.as("Back to work."),
          ),
        ),
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
      ({ project_id, project_date_id }) =>
        run(
          Effect.flatMap(ClockinEvents, (e) =>
            e.startProject(
              ProjectId.make(project_id),
              project_date_id != null
                ? ProjectDateId.make(project_date_id)
                : undefined,
            ),
          ).pipe(Effect.as(`Started working on project ${project_id}.`)),
        ),
    )

    server.registerTool(
      "list_projects",
      {
        description:
          "List projects. Optionally filter by a substring query. Returns project ids and names.",
        inputSchema: { query: z.string().optional() },
      },
      ({ query }) =>
        run(
          Effect.flatMap(ClockinProjects, (p) =>
            query ? p.search(query) : p.list(),
          ),
        ),
    )

    server.registerTool(
      "list_workdays",
      {
        description:
          "Recent workdays rolled up per day with durations and totals. Each entry has: date, startedAt/endedAt, ongoing, segments (each with type, project, startedAt/endedAt, durationSeconds), and totals { clockedInSeconds, workSeconds, breakSeconds, perProject }. Sufficient to answer 'how much have I worked today / on project X' without any further math.",
        inputSchema: {},
      },
      () => run(Effect.flatMap(ClockinWorkdays, (w) => w.summaries())),
    )

    server.registerTool(
      "time_overview",
      {
        description:
          "One-call time balance overview: { currentWeek: { weekStarting, workedHours, targetHours, remainingHours }, currentMonth: { workedHours, targetHours, remainingHours, overtimeHours }, annualFlextimeHours, used/planned/max vacation days }. Hours are decimals (e.g. 7.5 = 7h30m). Sufficient to answer 'how much have I worked this week / month, how much do I still need, what's my flextime / vacation'.",
        inputSchema: {},
      },
      () => run(Effect.flatMap(ClockinTimesheets, (t) => t.overview())),
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

  const handler = mcpHandler(
    {
      jwksUrl: `${authIssuer}/jwks`,
      verifyOptions: { issuer: authIssuer, audience: mcpResource },
    },
    (req, jwt) =>
      createMcpHandler(
        (server) =>
          // Registration is a synchronous effect: it only reads the two
          // request-scoped tags and wires callbacks (which bridge to the
          // runtime lazily, per invocation).
          Effect.runSync(
            registerTools(runtime).pipe(
              Effect.provideService(McpServer, server),
              Effect.provideService(McpJwt, jwt),
            ),
          ),
        { serverInfo: { name: "clockin-mcp", version: "0.1.0" } },
        { basePath: "/", verboseLogs: baseUrl.includes("localhost") },
      )(req),
  )

  handlerCache.set(env, handler)
  return handler
}
