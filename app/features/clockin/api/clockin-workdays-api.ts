import { HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { DeviceClockinClient, onlyClockinErrors } from "../client";
import { WorkdayArrayResponse, type Workday } from "~/lib/domain/workday";
import type { EmployeeId } from "~/lib/domain/employee";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Pure transport over the upstream `/workdays` resource (device_token). The
// per-day rollups and status derivation built from this payload live in the
// ClockinWorkdays / ClockinStatus business services.

export interface ClockinWorkdaysApiService {
  /**
   * List the raw workdays (with nested events) for an employee.
   *
   * `GET /workdays?employee_id={id}` (device_token) → 401 bad or missing token.
   * When `employeeId` is omitted the upstream falls back to the token's own
   * employee. Transport/decode failures are defects, not part of this channel.
   */
  readonly list: (
    employeeId?: EmployeeId
  ) => Effect.Effect<ReadonlyArray<Workday>, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinWorkdaysApi extends Context.Tag("ClockinWorkdaysApi")<
  ClockinWorkdaysApi,
  ClockinWorkdaysApiService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Rides DeviceClockinClient (device_token). `onlyClockinErrors` keeps the
// documented 401 and turns every other failure into a defect.

export const ClockinWorkdaysApiLive = Layer.effect(
  ClockinWorkdaysApi,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    return ClockinWorkdaysApi.of({
      list: (employeeId) =>
        device
          .get(employeeId != null ? `/workdays?employee_id=${employeeId}` : "/workdays")
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkdayArrayResponse)),
            Effect.map((r) => r.data),
            Effect.scoped,
            onlyClockinErrors("ClockinUnauthenticatedError")
          )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
