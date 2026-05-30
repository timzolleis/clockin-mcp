import { HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { UserClockinClient, onlyClockinErrors } from "../client";
import {
  TimesheetMonth,
  TimesheetRangeResponse,
  TimesheetsTotals,
  TimesheetsTotalsResponse
} from "~/lib/domain/timesheet";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Pure transport over the upstream `/timesheets` resource (user_token). The
// derived current-week/current-month overview (which also folds in a live
// /workdays delta) lives in the ClockinTimesheets business service.

export interface ClockinTimesheetsApiService {
  /**
   * Per-month worked/target seconds for an inclusive ISO date range.
   *
   * `GET /timesheets/{start}/{end}` (user_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly range: (
    start: string,
    end: string
  ) => Effect.Effect<ReadonlyArray<TimesheetMonth>, ClockinUnauthenticatedError, CurrentClockinCredentials>;

  /**
   * Account-level rollups: flextime balance and vacation-day counters.
   *
   * `GET /timesheets/totals` (user_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly totals: () => Effect.Effect<TimesheetsTotals, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinTimesheetsApi extends Context.Tag("ClockinTimesheetsApi")<
  ClockinTimesheetsApi,
  ClockinTimesheetsApiService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Rides UserClockinClient (user_token). `onlyClockinErrors` keeps each op's
// documented 401 and turns every other failure into a defect.

export const ClockinTimesheetsApiLive = Layer.effect(
  ClockinTimesheetsApi,
  Effect.gen(function* () {
    const user = yield* UserClockinClient;

    return ClockinTimesheetsApi.of({
      range: (start, end) =>
        user.get(`/timesheets/${start}/${end}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(TimesheetRangeResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      totals: () =>
        user.get("/timesheets/totals").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(TimesheetsTotalsResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        )
    });
  })
).pipe(Layer.provide([UserClockinClient.Default]));
