import { Context, Effect, Layer } from "effect";
import { CurrentClockinCredentials } from "../client";
import { ClockinEventsApi, ClockinEventsApiLive, type EventWriteError } from "../api";
import type { ClockableTaskId } from "~/lib/domain/task";
import type { EventInput } from "~/lib/domain/event";
import type { ProjectDateId, ProjectId } from "~/lib/domain/project";
import { TaskId } from "./clockin-tasks";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Intent-oriented time tracking. Each method composes an event payload — fresh
// uuid, occured_at = now (UTC, ms stripped), employee_id from the current
// credentials — and posts it through ClockinEventsApi (`/events/storeMany`,
// device_token). The transport + error narrowing live in the API layer; this
// layer owns the payload construction and multi-event orchestration.

// Every intent optionally accepts `occurredAt` — the instant the event happened
// — so callers can backdate ("clock me in at 08:40"). Omitted ⇒ now (UTC). The
// instant is rendered ms-stripped UTC by `build`; resolving a user's "08:40"
// into a UTC `Date` is the tool layer's job (see `parseAt`).
export interface ClockinEventsService {
  /** Clock in (task_id=10). 400/401/422. */
  readonly clockIn: (occurredAt?: Date) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Clock out (task_id=8). 400/401/422. */
  readonly clockOut: (occurredAt?: Date) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Start a break (task_id=5). 400/401/422. */
  readonly startBreak: (occurredAt?: Date) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Resume work (task_id=10). 400/401/422. */
  readonly resumeWork: (occurredAt?: Date) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Switch to a project (task_id=4, project_id required) — emits a single
   * PROJECT event. Assumes the workday is already open; pair with
   * {@link clockInAndSwitchToProject} when starting from clocked out. 400/401/422.
   */
  readonly switchToProject: (
    projectId: ProjectId,
    projectDateId?: ProjectDateId,
    occurredAt?: Date
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Open the workday and switch to a project in one atomic batch — emits a WORK
   * event (task_id=10) immediately followed by a PROJECT event (task_id=4) one
   * second later so it sorts strictly last for status reads. `occurredAt` sets
   * the WORK event's instant (the PROJECT event follows +1s). 400/401/422.
   */
  readonly clockInAndSwitchToProject: (
    projectId: ProjectId,
    projectDateId?: ProjectDateId,
    occurredAt?: Date
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Generic task switch. `taskId` is constrained to the clockable IDs, so an
   * invalid task is a compile error rather than a runtime failure. `projectId`
   * is required when `taskId` is 4 (PROJECT). 400/401/422.
   */
  readonly switchTask: (
    taskId: ClockableTaskId,
    projectId?: ProjectId
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;
}

export class ClockinEvents extends Context.Tag("ClockinEvents")<
  ClockinEvents,
  ClockinEventsService
>() { }

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

/** Strip milliseconds from an ISO timestamp: `2024-01-01T09:42:00.000Z` → `…00Z`. */
const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** A partial event draft the intent helpers expand into a full {@link EventInput}. */
type EventDraft = {
  taskId: ClockableTaskId;
  projectId?: number | null;
  projectDateId?: number | null;
  occurredAt?: Date;
};

/**
 * Build the storeMany payload from a draft — fresh uuid, `occured_at` = now
 * (UTC, ms stripped) unless overridden, `employee_id` from the current creds.
 * Mirrors the iOS app: `id: null`, `project_date_id` omitted unless set.
 */
const build = (draft: EventDraft, employeeId: number): EventInput => ({
  id: null,
  uuid: crypto.randomUUID(),
  occured_at: isoNoMs(draft.occurredAt ?? new Date()),
  task_id: draft.taskId,
  project_id: draft.projectId ?? null,
  // Only include project_date_id when explicitly set — matches mobile.
  ...(draft.projectDateId != null ? { project_date_id: draft.projectDateId } : {}),
  task_label: "",
  employee_id: employeeId,
  is_workplan_event: null,
  site_id: null
});

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Builds payloads off the current credentials and hands them to ClockinEventsApi.
// No HTTP or error handling here — that's the API layer's job.

export const ClockinEventsLive = Layer.effect(
  ClockinEvents,
  Effect.gen(function* () {
    const api = yield* ClockinEventsApi;

    /** Build a single intent event off the current creds and post it. */
    const one = (draft: EventDraft) =>
      Effect.flatMap(CurrentClockinCredentials, (creds) => api.storeMany([build(draft, creds.employeeId)]));

    return ClockinEvents.of({
      clockIn: (occurredAt) => one({ taskId: TaskId.WORK, occurredAt }),
      clockOut: (occurredAt) => one({ taskId: TaskId.CLOCKOUT, occurredAt }),
      startBreak: (occurredAt) => one({ taskId: TaskId.BREAK, occurredAt }),
      resumeWork: (occurredAt) => one({ taskId: TaskId.WORK, occurredAt }),

      switchToProject: (projectId, projectDateId, occurredAt) =>
        one({ taskId: TaskId.PROJECT, projectId, projectDateId: projectDateId ?? null, occurredAt }),

      clockInAndSwitchToProject: (projectId, projectDateId, occurredAt) =>
        Effect.flatMap(CurrentClockinCredentials, (creds) => {
          const now = occurredAt ?? new Date();
          // The PROJECT event must sort strictly AFTER the WORK event: occured_at
          // has ms stripped and status uses a strict `>` tie-break, so bump the
          // project event +1s to guarantee it reads back as the latest.
          const work = build({ taskId: TaskId.WORK, occurredAt: now }, creds.employeeId);
          const project = build(
            {
              taskId: TaskId.PROJECT,
              projectId,
              projectDateId: projectDateId ?? null,
              occurredAt: new Date(now.getTime() + 1000)
            },
            creds.employeeId
          );
          return api.storeMany([work, project]);
        }),

      switchTask: (taskId, projectId) => {
        if (taskId === TaskId.PROJECT && projectId == null) {
          // Programmer error — the interface requires a project_id for PROJECT.
          return Effect.die(new Error("PROJECT task requires a project_id"));
        }
        return one({ taskId, projectId: projectId ?? null });
      }
    });
  })
).pipe(Layer.provide([ClockinEventsApiLive]));
