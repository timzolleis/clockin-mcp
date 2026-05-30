import { HttpBody, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";
import type {
  ClockinBadRequestError,
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "./clockin-api-errors";
import { CurrentClockinCredentials, DeviceClockinClient, UserClockinClient, onlyClockinErrors } from "./clockin-client";
import { WorkdayArrayResponse, type Workday } from "~/lib/domain/workday";
import type { ClockableTaskId } from "~/lib/domain/task";
import type { EventInput } from "~/lib/domain/event";
import { TransactionId, type EventId } from "~/lib/domain/event";
import type { ProjectDateId, ProjectId } from "~/lib/domain/project";
import { TaskId } from "./clockin-tasks";

// ---------------------------------------------------------------------------
// Error channels
// ---------------------------------------------------------------------------

/** `POST /events/storeMany` (device_token) → 400 bad request, 401, 422 validation. */
export type EventWriteError =
  | ClockinBadRequestError
  | ClockinUnauthenticatedError
  | ClockinValidationError;

/** `/correction/*` writes (user_token) → 401, 422 validation. */
export type CorrectionWriteError = ClockinUnauthenticatedError | ClockinValidationError;

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------
// NOTE: the upstream /correction responses are placeholder schemas in the spec
// (x-extracted: false). These shapes follow CLOCKIN_API_BRIEF.md; refine field
// types once we capture real responses.

/** Result of `POST /correction/storeEvent`. */
export class CorrectionStored extends Schema.Class<CorrectionStored>("CorrectionStored")({
  transactionId: TransactionId,
  eventUuid: Schema.String.pipe(Schema.propertySignature, Schema.fromKey("event_uuid"))
}) { }

/** Result of `PATCH /correction/updateEvent/{eventId}`. */
export class CorrectionUpdated extends Schema.Class<CorrectionUpdated>("CorrectionUpdated")({
  transactionId: TransactionId,
  firstInstanceToRefresh: Schema.NullOr(Schema.String),
  lastInstanceToRefresh: Schema.NullOr(Schema.String)
}) { }

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinEventsService {
  // -- Live events: intent-oriented helpers, all post to /events/storeMany ----
  // (device_token). Each composes the event payload — fresh uuid, occured_at =
  // now (UTC, ms stripped), employee_id from the current credentials.

  /** Clock in (task_id=10). `POST /events/storeMany`, device_token, 400/401/422. */
  readonly clockIn: () => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Clock out (task_id=8). `POST /events/storeMany`, device_token, 400/401/422. */
  readonly clockOut: () => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Start a break (task_id=5). `POST /events/storeMany`, device_token, 400/401/422. */
  readonly startBreak: () => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /** Resume work (task_id=10). `POST /events/storeMany`, device_token, 400/401/422. */
  readonly resumeWork: () => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Switch to a project (task_id=4, project_id required).
   * `POST /events/storeMany`, device_token, 400/401/422.
   */
  readonly startProject: (
    projectId: ProjectId,
    projectDateId?: ProjectDateId
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Generic task switch. `taskId` is constrained to the clockable IDs, so an
   * invalid task is a compile error rather than a runtime failure. `projectId`
   * is required when `taskId` is 4 (PROJECT).
   * `POST /events/storeMany`, device_token, 400/401/422.
   */
  readonly switchTask: (
    taskId: ClockableTaskId,
    projectId?: ProjectId
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  /**
   * Post a raw, pre-built batch of events (offline catch-up, ordered by
   * occured_at). `POST /events/storeMany`, device_token, 400/401/422.
   */
  readonly storeEvents: (
    events: ReadonlyArray<EventInput>
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;

  // -- Corrections: edit event history (user_token) --------------------------

  /**
   * Workdays in the correction view (same shape as /workdays, intended for
   * editing). `GET /correction`, user_token, 401.
   */
  readonly correctionWorkdays: () => Effect.Effect<
    ReadonlyArray<Workday>,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * Insert a corrective event into history.
   * `POST /correction/storeEvent`, user_token, 401/422.
   */
  readonly storeCorrection: (
    event: EventInput
  ) => Effect.Effect<CorrectionStored, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Edit an existing event.
   * `PATCH /correction/updateEvent/{eventId}`, user_token, 401/422.
   */
  readonly updateCorrection: (
    eventId: EventId,
    fields: Partial<EventInput>
  ) => Effect.Effect<CorrectionUpdated, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Remove an event.
   * `DELETE /correction/deleteEvent/{eventId}`, user_token, 401/422.
   */
  readonly deleteCorrection: (
    eventId: EventId
  ) => Effect.Effect<void, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Undo a previous correction transaction.
   * `PATCH /correction/undo/{transactionId}`, user_token, 401/422.
   */
  readonly undoCorrection: (
    transactionId: TransactionId
  ) => Effect.Effect<void, CorrectionWriteError, CurrentClockinCredentials>;
}

export class ClockinEvents extends Context.Tag("ClockinEvents")<
  ClockinEvents,
  ClockinEventsService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Live events ride DeviceClockinClient (device_token) and POST to
// /events/storeMany; the /correction methods ride UserClockinClient
// (user_token). `onlyClockinErrors` keeps each op's documented statuses and
// turns every other failure — undocumented status, transport, decode — into a
// defect, matching the interface's narrow error channels.

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

export const ClockinEventsLive = Layer.effect(
  ClockinEvents,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;
    const user = yield* UserClockinClient;

    /** POST a single intent-built event; reads employee_id from the current creds. */
    const send = (draft: EventDraft) =>
      Effect.gen(function* () {
        const creds = yield* CurrentClockinCredentials;
        return yield* device.post("/events/storeMany", {
          body: HttpBody.unsafeJson([build(draft, creds.employeeId)])
        });
      }).pipe(
        Effect.asVoid,
        Effect.scoped,
        onlyClockinErrors("ClockinBadRequestError", "ClockinUnauthenticatedError", "ClockinValidationError")
      );

    return ClockinEvents.of({
      clockIn: () => send({ taskId: TaskId.WORK }),
      clockOut: () => send({ taskId: TaskId.CLOCKOUT }),
      startBreak: () => send({ taskId: TaskId.BREAK }),
      resumeWork: () => send({ taskId: TaskId.WORK }),

      startProject: (projectId, projectDateId) =>
        send({ taskId: TaskId.PROJECT, projectId, projectDateId: projectDateId ?? null }),

      switchTask: (taskId, projectId) => {
        if (taskId === TaskId.PROJECT && projectId == null) {
          // Programmer error — the interface requires a project_id for PROJECT.
          return Effect.die(new Error("PROJECT task requires a project_id"));
        }
        return send({ taskId, projectId: projectId ?? null });
      },

      storeEvents: (events) =>
        device.post("/events/storeMany", { body: HttpBody.unsafeJson(events) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinBadRequestError", "ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      correctionWorkdays: () =>
        user.get("/correction").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkdayArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      storeCorrection: (event) =>
        user.post("/correction/storeEvent", { body: HttpBody.unsafeJson(event) }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(CorrectionStored)),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      updateCorrection: (eventId, fields) =>
        user.patch(`/correction/updateEvent/${eventId}`, { body: HttpBody.unsafeJson(fields) }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(CorrectionUpdated)),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      deleteCorrection: (eventId) =>
        user.del(`/correction/deleteEvent/${eventId}`).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      undoCorrection: (transactionId) =>
        user.patch(`/correction/undo/${transactionId}`, { body: HttpBody.unsafeJson({}) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default, UserClockinClient.Default]));
