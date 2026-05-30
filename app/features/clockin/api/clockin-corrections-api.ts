import { HttpBody, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";
import type { ClockinUnauthenticatedError, ClockinValidationError } from "../client";
import { CurrentClockinCredentials, UserClockinClient, onlyClockinErrors } from "../client";
import { WorkdayArrayResponse, type Workday } from "~/lib/domain/workday";
import type { EventInput } from "~/lib/domain/event";
import { TransactionId, type EventId } from "~/lib/domain/event";

// ---------------------------------------------------------------------------
// Error channel
// ---------------------------------------------------------------------------

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
   * Insert a corrective event into history.
   * `POST /correction/storeEvent`, user_token, 401/422.
   */
  readonly storeEvent: (
    event: EventInput
  ) => Effect.Effect<CorrectionStored, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Edit an existing event.
   * `PATCH /correction/updateEvent/{eventId}`, user_token, 401/422.
   */
  readonly updateEvent: (
    eventId: EventId,
    fields: Partial<EventInput>
  ) => Effect.Effect<CorrectionUpdated, CorrectionWriteError, CurrentClockinCredentials>;

  /**
   * Remove an event.
   * `DELETE /correction/deleteEvent/{eventId}`, user_token, 401/422.
   */
  readonly deleteEvent: (
    eventId: EventId
  ) => Effect.Effect<void, CorrectionWriteError, CurrentClockinCredentials>;

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

      storeEvent: (event) =>
        user.post("/correction/storeEvent", { body: HttpBody.unsafeJson(event) }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(CorrectionStored)),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      updateEvent: (eventId, fields) =>
        user.patch(`/correction/updateEvent/${eventId}`, { body: HttpBody.unsafeJson(fields) }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(CorrectionUpdated)),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      deleteEvent: (eventId) =>
        user.del(`/correction/deleteEvent/${eventId}`).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
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
