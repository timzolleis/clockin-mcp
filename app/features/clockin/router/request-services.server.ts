import { Layer } from "effect"
import { ClockinCredentialsServiceLive } from "~/features/clockin/credentials/credentials-service"
import { ClockinAuthLive } from "~/features/clockin/service/clockin-auth"
import { ClockinEmployeeLive } from "~/features/clockin/service/clockin-employee"
import { ClockinEventsLive } from "~/features/clockin/service/clockin-events"
import { ClockinProjectsLive } from "~/features/clockin/service/clockin-projects"
import { ClockinStatusLive } from "~/features/clockin/service/clockin-status"
import { ClockinTimesheetsLive } from "~/features/clockin/service/clockin-timesheets"
import { ClockinWorkdaysLive } from "~/features/clockin/service/clockin-workdays"
import { DatabaseLive } from "~/lib/effect/db"

// Every service a v1 handler touches: the upstream Clockin clients (each Live
// layer bundles its own HttpClient) plus the credentials service, which itself
// exposes the repository + token vault via provideMerge.
//
// Exported so other entrypoints (the MCP runtime) can wire the same graph. The
// only env-derived leaf is `CloudflareEnv`; everything downstream (drizzle,
// repository, vault, Clockin config) resolves off it, so consumers just
// `provideMerge(DatabaseLive)` + provide the `CloudflareEnv` tag.
export const ServicesLive = Layer.mergeAll(
  ClockinAuthLive,
  ClockinEmployeeLive,
  ClockinEventsLive,
  ClockinProjectsLive,
  ClockinStatusLive,
  ClockinTimesheetsLive,
  ClockinWorkdaysLive,
  ClockinCredentialsServiceLive,
)

// The whole service graph plus the database, with `CloudflareEnv` left as the
// single remaining requirement. Everything downstream (drizzle, repository,
// vault, Clockin config/base URL) resolves off that one leaf.
//
// Consumed via `Effect.provide(eff, RequestServicesLive)` inside each handler,
// which leaves `CloudflareEnv` as the handler's only env requirement — supplied
// per request by `EnvMiddleware` (which reads the injected AppContext). Because
// the env arrives through middleware rather than a hard `AppContext` read here,
// `AppContext` never enters the static build `R`, so the web handler needs no
// build-time placeholder.
export const RequestServicesLive = ServicesLive.pipe(
  Layer.provideMerge(DatabaseLive),
)
