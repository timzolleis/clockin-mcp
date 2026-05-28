import { eq } from "drizzle-orm"
import { Effect, Redacted } from "effect"
import { user } from "~/lib/db/auth-schema"
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
import {
  serverRuntime,
  type ServerServices,
} from "~/lib/effect/runtime"
import { EncryptedToken, TokenVault } from "~/lib/effect/vault"

const COMMANDS = [
  "status",
  "workdays",
  "projects",
  "totals",
  "employee",
  "task-configs",
  "clock-in",
  "clock-out",
  "break",
  "resume",
  "login",
] as const
type Command = (typeof COMMANDS)[number]

const isCommand = (s: string): s is Command =>
  (COMMANDS as readonly string[]).includes(s)

const usage = () => {
  console.error(`Usage:
  pnpm clockin <email> <command> [args]
  pnpm clockin login <clockin-email> <clockin-password>

Commands: ${COMMANDS.join(", ")}

Examples:
  pnpm clockin tzolleis@gmail.com status
  pnpm clockin tzolleis@gmail.com projects "design"
  pnpm clockin login me@example.com 's3cret'`)
  process.exit(1)
}

const loadTokensFor = (appEmail: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    const vault = yield* TokenVault
    const u = yield* Effect.promise(() =>
      db
        .select()
        .from(user)
        .where(eq(user.email, appEmail))
        .limit(1)
        .then((rows) => rows[0]),
    )
    if (!u) {
      return yield* Effect.dieMessage(
        `No app user with email ${appEmail}. Sign up at /sign-up first.`,
      )
    }
    const row = yield* Effect.promise(() =>
      db
        .select()
        .from(userToken)
        .where(eq(userToken.userId, u.id))
        .limit(1)
        .then((rows) => rows[0]),
    )
    if (!row) {
      return yield* Effect.dieMessage(
        `No Clockin credentials for ${appEmail}. Visit /settings.`,
      )
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

const args = process.argv.slice(2)
if (args.length < 2) usage()

// ---- Login flow doesn't need a stored token ------------------------------
if (args[0] === "login") {
  const [, email, password] = args
  if (!email || !password) usage()
  const result = await serverRuntime.runPromise(
    Effect.flatMap(ClockinAuth, (a) => a.login(email!, password!)),
  )
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

// ---- Normal flow: load this user's stored tokens -------------------------
const [appEmail, cmdArg, ...rest] = args
if (!cmdArg || !isCommand(cmdArg)) usage()
const cmd = cmdArg as Command

const program: Effect.Effect<
  unknown,
  unknown,
  ServerServices | ClockinTokens
> = (() => {
  switch (cmd) {
    case "status":
      return Effect.flatMap(ClockinStatus, (s) => s.current())
    case "workdays":
      return Effect.flatMap(ClockinWorkdays, (w) => w.list())
    case "projects": {
      const query = rest[0]
      return Effect.flatMap(ClockinProjects, (p) =>
        query ? p.search(query) : p.list(),
      )
    }
    case "totals":
      return Effect.flatMap(ClockinTimesheets, (t) => t.totals())
    case "employee":
      return Effect.flatMap(ClockinEmployee, (e) => e.me())
    case "task-configs":
      return Effect.flatMap(ClockinEmployee, (e) => e.taskConfigs())
    case "clock-in":
      return Effect.flatMap(ClockinEvents, (e) => e.clockIn())
    case "clock-out":
      return Effect.flatMap(ClockinEvents, (e) => e.clockOut())
    case "break":
      return Effect.flatMap(ClockinEvents, (e) => e.startBreak())
    case "resume":
      return Effect.flatMap(ClockinEvents, (e) => e.resumeWork())
    case "login":
      throw new Error("unreachable")
  }
})()

const result = await serverRuntime.runPromise(
  Effect.flatMap(loadTokensFor(appEmail!), (tokens) =>
    program.pipe(Effect.provideService(ClockinTokens, tokens)),
  ),
)
console.log(JSON.stringify(result, null, 2))
process.exit(0)
