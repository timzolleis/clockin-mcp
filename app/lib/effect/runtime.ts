import { Layer, ManagedRuntime } from "effect"
import { AppConfig } from "~/lib/config/app-config"
import { ClockinAuth } from "./clockin/auth"
import { ClockinCorrections } from "./clockin/corrections"
import { ClockinEmployee } from "./clockin/employee"
import { ClockinEvents } from "./clockin/events"
import { ClockinProjects } from "./clockin/projects"
import { ClockinStatus } from "./clockin/status"
import { ClockinTimesheets } from "./clockin/timesheets"
import { ClockinWorkdays } from "./clockin/workdays"
import { Database } from "./db"
import { TokenVault } from "./vault"

// The single server-side layer. Compose every Effect.Service we want callable
// from request handlers, scripts, and the MCP route into one place; bridges
// (HttpApiBuilder.toWebHandler, mcp-handler, scripts) all run through this
// runtime so they share connections, config decoding, etc.
const ServerLayer = Layer.mergeAll(
  AppConfig.layer,
  Database.Live,
  TokenVault.Default,
  ClockinAuth.Default,
  ClockinCorrections.Default,
  ClockinEmployee.Default,
  ClockinEvents.Default,
  ClockinProjects.Default,
  ClockinStatus.Default,
  ClockinTimesheets.Default,
  ClockinWorkdays.Default,
)

export type ServerServices = Layer.Layer.Success<typeof ServerLayer>

export const serverRuntime = ManagedRuntime.make(ServerLayer)

// Back-compat alias — older imports.
export const runtime = serverRuntime
export type ClockinServices = ServerServices
