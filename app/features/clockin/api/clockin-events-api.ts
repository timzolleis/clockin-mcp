import { HttpBody } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type {
  ClockinBadRequestError,
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "../client";
import { CurrentClockinCredentials, DeviceClockinClient, onlyClockinErrors } from "../client";
import type { EventInput } from "~/lib/domain/event";

// ---------------------------------------------------------------------------
// Error channel
// ---------------------------------------------------------------------------

/** `POST /events/storeMany` (device_token) → 400 bad request, 401, 422 validation. */
export type EventWriteError =
  | ClockinBadRequestError
  | ClockinUnauthenticatedError
  | ClockinValidationError;

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Pure transport over the upstream `/events` resource: it POSTs a pre-built
// batch and decodes nothing back (the endpoint returns void). All payload
// construction (uuid, occured_at, employee_id) lives in the business layer.

export interface ClockinEventsApiService {
  /**
   * Post a batch of pre-built events (ordered by `occured_at`).
   *
   * `POST /events/storeMany` (device_token) → 400 bad request, 401, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly storeMany: (
    events: ReadonlyArray<EventInput>
  ) => Effect.Effect<void, EventWriteError, CurrentClockinCredentials>;
}

export class ClockinEventsApi extends Context.Tag("ClockinEventsApi")<
  ClockinEventsApi,
  ClockinEventsApiService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Rides DeviceClockinClient (device_token). `onlyClockinErrors` keeps the
// documented statuses and turns every other failure — undocumented status,
// transport, decode — into a defect.

export const ClockinEventsApiLive = Layer.effect(
  ClockinEventsApi,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    return ClockinEventsApi.of({
      storeMany: (events) =>
        device.post("/events/storeMany", { body: HttpBody.unsafeJson(events) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinBadRequestError", "ClockinUnauthenticatedError", "ClockinValidationError")
        )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
