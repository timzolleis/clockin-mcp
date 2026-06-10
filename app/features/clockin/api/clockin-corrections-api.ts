import { HttpBody, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";
import type {
  ClockinNotFoundError,
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "../client";
import { CurrentClockinCredentials, UserClockinClient, onlyClockinErrors } from "../client";
import { Envelope } from "~/lib/domain/shared";
import { WorkdayArrayResponse, type Workday } from "~/lib/domain/workday";
import { TransactionId, type EventId } from "~/lib/domain/event";
import type { ClockableTaskId } from "~/lib/domain/task";

// ---------------------------------------------------------------------------
// Error channel
// ---------------------------------------------------------------------------

/** `/correction/*` writes (user_token) → 401, 422 validation. */
export type CorrectionWriteError = ClockinUnauthenticatedError | ClockinValidationError;

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------
// Verified against the real upstream (see app's Correction.getPayload + captured
// responses): a correction is an ACTIVITY SPAN with local `HH:mm` times that the
// backend materializes into boundary events. Responses are `{ data: ... }`.

/**
 * Request body for `storeEvent` / `updateEvent` — the activity span. Times are
 * employee-LOCAL (`start_date`/`start_time` "YYYY-MM-DD"/"HH:mm"). `id` is set
 * on updates (mirrors the app; it's also the path param).
 */
export interface CorrectionActivity {
  readonly id?: number | null;
  readonly start_date: string;
  readonly start_time: string;
  readonly end_date: string | null;
  readonly end_time: string | null;
  readonly task_id: ClockableTaskId;
  readonly project_id: number | null;
  readonly site_id: number | null;
  readonly correction_reason: string | null;
}

/** `data` of `POST /correction/storeEvent`. */
export class CorrectionStored extends Schema.Class<CorrectionStored>("CorrectionStored")({
  transactionId: TransactionId,
  eventUuid: Schema.String.pipe(Schema.propertySignature, Schema.fromKey("event_uuid"))
}) { }

/** `data` of `PATCH /correction/updateEvent/{eventId}`. */
export class CorrectionUpdated extends Schema.Class<CorrectionUpdated>("CorrectionUpdated")({
  transactionId: TransactionId,
  firstInstanceToRefresh: Schema.NullOr(Schema.String),
  lastInstanceToRefresh: Schema.NullOr(Schema.String)
}) { }

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Pure transport over the upstream `/correction` resource (user_token) — editing
// event history. No derivation; callers pass pre-built events.

export interface ClockinCorrectionsApiService {
  /**
   * Workdays in the correction view (same shape as /workdays, intended for
   * editing). `GET /correction`, user_token, 401.
   */
  readonly workdays: () => Effect.Effect<
    ReadonlyArray<Workday>,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * Insert a correction activity span into history (materializes into boundary
   * events). `POST /correction/storeEvent`, user_token, 401/422.
   */
  readonly storeEvent: (
    activity: CorrectionActivity
  ) => Effect.Effect<CorrectionStored, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Resize/retarget an existing activity, addressed by its opening event id.
   * `PATCH /correction/updateEvent/{eventId}`, user_token, 401/422.
   */
  readonly updateEvent: (
    eventId: EventId,
    activity: CorrectionActivity
  ) => Effect.Effect<CorrectionUpdated, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Remove an event.
   * `DELETE /correction/deleteEvent/{eventId}`, user_token, 401/404/422.
   * 404 when the event no longer exists — reachable in normal operation:
   * deleting one event can cascade to its materialized boundary events
   * upstream, so an id read moments earlier may already be gone.
   */
  readonly deleteEvent: (
    eventId: EventId
  ) => Effect.Effect<
    void,
    CorrectionWriteError | ClockinNotFoundError,
    CurrentClockinCredentials
  >;

  /**
   * Undo a previous correction transaction.
   * `PATCH /correction/undo/{transactionId}`, user_token, 401/422.
   */
  readonly undo: (
    transactionId: TransactionId
  ) => Effect.Effect<void, CorrectionWriteError, CurrentClockinCredentials>;
}

export class ClockinCorrectionsApi extends Context.Tag("ClockinCorrectionsApi")<
  ClockinCorrectionsApi,
  ClockinCorrectionsApiService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Rides UserClockinClient (user_token). `onlyClockinErrors` keeps each op's
// documented statuses and turns every other failure into a defect.

export const ClockinCorrectionsApiLive = Layer.effect(
  ClockinCorrectionsApi,
  Effect.gen(function* () {
    const user = yield* UserClockinClient;

    return ClockinCorrectionsApi.of({
      workdays: () =>
        user.get("/correction").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkdayArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      storeEvent: (activity) =>
        user.post("/correction/storeEvent", { body: HttpBody.unsafeJson(activity) }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Envelope(CorrectionStored))),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      updateEvent: (eventId, activity) =>
        user.patch(`/correction/updateEvent/${eventId}`, {
          body: HttpBody.unsafeJson({ ...activity, id: eventId })
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Envelope(CorrectionUpdated))),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      deleteEvent: (eventId) =>
        user.del(`/correction/deleteEvent/${eventId}`).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors(
            "ClockinUnauthenticatedError",
            "ClockinNotFoundError",
            "ClockinValidationError"
          )
        ),

      undo: (transactionId) =>
        user.patch(`/correction/undo/${transactionId}`, { body: HttpBody.unsafeJson({}) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        )
    });
  })
).pipe(Layer.provide([UserClockinClient.Default]));
