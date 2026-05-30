import { HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "./clockin-api-errors";
import type { CurrentClockinCredentials } from "./clockin-client";
import { DeviceClockinClient, onlyClockinErrors } from "./clockin-client";
import { CurrentStatus } from "~/lib/domain/status";
import { ProjectArrayResponse, ProjectRef } from "~/lib/domain/project";
import { WorkdayArrayResponse, type Workday } from "~/lib/domain/workday";
import type { EventRead } from "~/lib/domain/event";
import type { WorkState } from "~/lib/domain/task";
import { stateOfTask } from "./clockin-tasks";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinStatusService {
  /**
   * Derive the employee's current clock-in status. There is no upstream status
   * endpoint: this reads `GET /workdays` (device_token), takes the latest event
   * in the latest workday, and resolves `project_id` to a project name
   * client-side.
   *
   * `GET /workdays` → 401 bad or missing token. Transport/decode failures are
   * defects, not part of this channel.
   */
  readonly current: () => Effect.Effect<CurrentStatus, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinStatus extends Context.Tag("ClockinStatus")<
  ClockinStatus,
  ClockinStatusService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// `current` rides the DeviceClockinClient (device_token) to read `GET /workdays`,
// then computes the status purely client-side. When the latest event is a
// project event, the project name is resolved best-effort via `GET /projects`
// (a failed resolve degrades to `null`, never to a status error).

const latestEvent = (days: readonly Workday[]): EventRead | null => {
  let best: EventRead | null = null;
  for (const day of days) {
    for (const ev of day.events ?? []) {
      if (!best || ev.occured_at > best.occured_at) best = ev;
    }
  }
  return best;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const elapsedSeconds = (since: string, now: Date): number => {
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
};

const describe = (
  state: WorkState,
  project: ProjectRef | null,
  since: string | null,
  forSeconds: number
): string => {
  const tail = since
    ? ` for ${formatDuration(forSeconds)} (since ${formatTime(since)})`
    : "";
  switch (state) {
    case "working":
      return `Working${tail}.`;
    case "working_on_project":
      return project
        ? `Working on project "${project.name}"${tail}.`
        : `Working on a project${tail}.`;
    case "on_break":
      return `On break${tail}.`;
    case "driving":
      return `Driving${tail}.`;
    case "loading":
      return `Loading${tail}.`;
    case "business_trip":
      return `On a business trip${tail}.`;
    case "special":
      return `Working on a special task${tail}.`;
    case "clocked_out":
      return "Not currently clocked in.";
    default:
      return "Status unknown.";
  }
};

export const ClockinStatusLive = Layer.effect(
  ClockinStatus,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    const resolveProject = (id: number) =>
      device.get("/projects").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectArrayResponse)),
        Effect.map((r) => r.data),
        Effect.scoped,
        Effect.map((all) => {
          const p = all.find((x) => x.id === id);
          return p ? new ProjectRef({ id: p.id, name: p.name }) : null;
        }),
        Effect.catchAll(() => Effect.succeed(null))
      );

    return ClockinStatus.of({
      current: () =>
        device.get("/workdays").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkdayArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError"),
          Effect.flatMap((days) =>
            Effect.gen(function* () {
              const ev = latestEvent(days);
              if (!ev) {
                return new CurrentStatus({
                  state: "clocked_out",
                  description: describe("clocked_out", null, null, 0),
                  since: null,
                  forSeconds: 0,
                  project: null
                });
              }
              const state = stateOfTask(ev.task_id);
              const project =
                state === "working_on_project" && ev.project_id != null
                  ? yield* resolveProject(ev.project_id)
                  : null;
              const forSeconds = elapsedSeconds(ev.occured_at, new Date());
              return new CurrentStatus({
                state,
                description: describe(state, project, ev.occured_at, forSeconds),
                since: ev.occured_at,
                forSeconds,
                project
              });
            })
          )
        )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
