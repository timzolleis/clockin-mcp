import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { ClockinTimesheetsApi, ClockinTimesheetsApiLive } from "../api";
import { ClockinWorkdaysApi, ClockinWorkdaysApiLive } from "../api";
import type { EventRead } from "~/lib/domain/event";
import {
  MonthBalance,
  TimesheetMonth,
  TimesheetsTotals,
  TimeOverview,
  WeekBalance
} from "~/lib/domain/timesheet";
import { TaskId } from "./clockin-tasks";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Derived current-week + current-month + annual rollup, assembled client-side
// from the timesheet reads (ClockinTimesheetsApi) plus a live /workdays delta
// (ClockinWorkdaysApi). Raw transport lives in those API services.

export interface ClockinTimesheetsService {
  /**
   * Current-week, current-month and annual time balance, with the live
   * since-last-clock-in delta folded in.
   *
   * → 401 bad/missing token. Transport/decode failures are defects.
   */
  readonly overview: () => Effect.Effect<TimeOverview, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinTimesheets extends Context.Tag("ClockinTimesheets")<
  ClockinTimesheets,
  ClockinTimesheetsService
>() { }

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toHours = (s: number | undefined) =>
  s == null ? 0 : Math.round((s / 3600) * 100) / 100;

const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
};

const startOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
const endOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

// Tasks the mobile app counts toward "work_seconds" (excludes break + clockout).
const WORK_TASKS: ReadonlySet<number> = new Set([
  TaskId.WORK,
  TaskId.PROJECT,
  TaskId.DRIVE,
  TaskId.LOAD,
  TaskId.DUTY,
  TaskId.SPECIAL1,
  TaskId.SPECIAL2
]);

const computeLiveWorkSeconds = (latest: EventRead | null, now: Date): number => {
  if (!latest) return 0;
  if (!WORK_TASKS.has(latest.task_id)) return 0;
  const since = new Date(latest.occured_at).getTime();
  if (Number.isNaN(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / 1000));
};

const latestEvent = (
  days: readonly { events?: readonly EventRead[] }[]
): EventRead | null => {
  let best: EventRead | null = null;
  for (const day of days) {
    for (const ev of day.events ?? []) {
      if (!best || ev.occured_at > best.occured_at) best = ev;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Composes the timesheet range/totals reads (user_token, via ClockinTimesheetsApi)
// with a /workdays read (device_token, via ClockinWorkdaysApi) to derive the
// "live" seconds since the last clock-in. Each upstream read degrades to an
// empty default on failure so the overview is best-effort.

export const ClockinTimesheetsLive = Layer.effect(
  ClockinTimesheets,
  Effect.gen(function* () {
    const timesheetsApi = yield* ClockinTimesheetsApi;
    const workdaysApi = yield* ClockinWorkdaysApi;

    return ClockinTimesheets.of({
      overview: () =>
        Effect.gen(function* () {
          const now = new Date();
          const monthStart = fmtDate(startOfMonth(now));
          const monthEnd = fmtDate(endOfMonth(now));
          const weekStart = fmtDate(startOfWeek(now));

          const [months, t, days] = yield* Effect.all(
            [
              timesheetsApi.range(monthStart, monthEnd).pipe(
                Effect.catchAll(() => Effect.succeed<ReadonlyArray<TimesheetMonth>>([]))
              ),
              timesheetsApi.totals().pipe(
                Effect.catchAll(() =>
                  Effect.succeed<TimesheetsTotals>({
                    flextime_seconds: undefined,
                    used_vacation_days: undefined,
                    planned_vacation_days: undefined,
                    max_vacation_days: undefined
                  })
                )
              ),
              workdaysApi.list().pipe(Effect.catchAll(() => Effect.succeed([])))
            ],
            { concurrency: "unbounded" }
          );

          // Live delta: seconds since the last clock-in/project/drive event,
          // mirroring the mobile app's `liveWorkSecondsOfCurrentMonth`. Only
          // counted while the user is actively on the clock for a "work" task.
          const liveSeconds = computeLiveWorkSeconds(latestEvent(days), now);
          const liveHours = liveSeconds / 3600;

          const month = months.find((m) => m.month === now.getMonth() + 1);
          const monthWorked = toHours(month?.work_seconds) + liveHours;
          const monthTarget = toHours(month?.target_seconds);
          const currentMonth: MonthBalance | null = month
            ? MonthBalance.make({
                month: month.month,
                workedHours: Math.round(monthWorked * 100) / 100,
                targetHours: monthTarget,
                remainingHours:
                  Math.round(Math.max(0, monthTarget - monthWorked) * 100) / 100,
                overtimeHours:
                  Math.round(Math.max(0, monthWorked - monthTarget) * 100) / 100
              })
            : null;

          const week = month?.calendar_weeks?.[weekStart];
          const weekWorked = toHours(week?.work_seconds) + liveHours;
          const weekTarget = toHours(week?.target_seconds);
          const currentWeek: WeekBalance | null = week
            ? WeekBalance.make({
                weekStarting: weekStart,
                workedHours: Math.round(weekWorked * 100) / 100,
                targetHours: weekTarget,
                remainingHours:
                  Math.round(Math.max(0, weekTarget - weekWorked) * 100) / 100
              })
            : null;

          return TimeOverview.make({
            currentWeek,
            currentMonth,
            annualFlextimeHours:
              t.flextime_seconds != null ? toHours(t.flextime_seconds) : null,
            usedVacationDays: t.used_vacation_days ?? null,
            plannedVacationDays: t.planned_vacation_days ?? null,
            maxVacationDays: t.max_vacation_days ?? null
          });
        })
    });
  })
).pipe(Layer.provide([ClockinTimesheetsApiLive, ClockinWorkdaysApiLive]));
