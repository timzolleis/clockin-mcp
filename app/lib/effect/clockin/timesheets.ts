import { Effect } from "effect"
import { ClockinApiClient } from "./client"
import { ClockinWorkdays } from "./workdays"
import {
  MonthBalance,
  TimeOverview,
  TimesheetRangeResponse,
  TimesheetsTotalsResponse,
  WeekBalance,
  type EventRead,
} from "./schemas"
import { TaskId } from "./tasks"

const pad = (n: number) => String(n).padStart(2, "0")
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toHours = (s: number | undefined) =>
  s == null ? 0 : Math.round((s / 3600) * 100) / 100

const startOfWeek = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

const startOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0)
const endOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)

// Tasks the mobile app counts toward "work_seconds" (excludes break + clockout).
const WORK_TASKS: ReadonlySet<number> = new Set([
  TaskId.WORK,
  TaskId.PROJECT,
  TaskId.DRIVE,
  TaskId.LOAD,
  TaskId.DUTY,
  TaskId.SPECIAL1,
  TaskId.SPECIAL2,
])

const computeLiveWorkSeconds = (
  latest: EventRead | null,
  now: Date,
): number => {
  if (!latest) return 0
  if (!WORK_TASKS.has(latest.task_id)) return 0
  const since = new Date(latest.occured_at).getTime()
  if (Number.isNaN(since)) return 0
  return Math.max(0, Math.floor((now.getTime() - since) / 1000))
}

const latestEvent = (
  days: readonly { events?: readonly EventRead[] }[],
): EventRead | null => {
  let best: EventRead | null = null
  for (const day of days) {
    for (const ev of day.events ?? []) {
      if (!best || ev.occured_at > best.occured_at) best = ev
    }
  }
  return best
}

export class ClockinTimesheets extends Effect.Service<ClockinTimesheets>()(
  "ClockinTimesheets",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient
      const workdays = yield* ClockinWorkdays

      const totals = () =>
        api
          .get("/timesheets/totals", TimesheetsTotalsResponse)
          .pipe(Effect.map((r) => r.data))

      const range = (start: string, end: string) =>
        api
          .get(`/timesheets/${start}/${end}`, TimesheetRangeResponse)
          .pipe(Effect.map((r) => r.data))

      const overview = () =>
        Effect.gen(function* () {
          const now = new Date()
          const monthStart = fmtDate(startOfMonth(now))
          const monthEnd = fmtDate(endOfMonth(now))
          const weekStart = fmtDate(startOfWeek(now))

          const [months, t, days] = yield* Effect.all(
            [
              range(monthStart, monthEnd).pipe(
                Effect.catchAll(() => Effect.succeed([])),
              ),
              totals().pipe(
                Effect.catchAll(() =>
                  Effect.succeed({
                    flextime_seconds: undefined as number | undefined,
                    used_vacation_days: undefined as number | undefined,
                    planned_vacation_days: undefined as number | undefined,
                    max_vacation_days: undefined as number | undefined,
                  }),
                ),
              ),
              workdays.list().pipe(Effect.catchAll(() => Effect.succeed([]))),
            ],
            { concurrency: "unbounded" },
          )

          // Live delta: seconds since the last clock-in/project/drive event,
          // mirroring the mobile app's `liveWorkSecondsOfCurrentMonth`. Only
          // counted while the user is actively on the clock for a "work" task.
          const liveSeconds = computeLiveWorkSeconds(latestEvent(days), now)
          const liveHours = liveSeconds / 3600

          const month = months.find((m) => m.month === now.getMonth() + 1)
          const monthWorked = toHours(month?.work_seconds) + liveHours
          const monthTarget = toHours(month?.target_seconds)
          const currentMonth: MonthBalance | null = month
            ? MonthBalance.make({
                month: month.month,
                workedHours: Math.round(monthWorked * 100) / 100,
                targetHours: monthTarget,
                remainingHours:
                  Math.round(Math.max(0, monthTarget - monthWorked) * 100) /
                  100,
                overtimeHours:
                  Math.round(Math.max(0, monthWorked - monthTarget) * 100) /
                  100,
              })
            : null

          const week = month?.calendar_weeks?.[weekStart]
          const weekWorked = toHours(week?.work_seconds) + liveHours
          const weekTarget = toHours(week?.target_seconds)
          const currentWeek: WeekBalance | null = week
            ? WeekBalance.make({
                weekStarting: weekStart,
                workedHours: Math.round(weekWorked * 100) / 100,
                targetHours: weekTarget,
                remainingHours:
                  Math.round(Math.max(0, weekTarget - weekWorked) * 100) / 100,
              })
            : null

          return TimeOverview.make({
            currentWeek,
            currentMonth,
            annualFlextimeHours:
              t.flextime_seconds != null ? toHours(t.flextime_seconds) : null,
            usedVacationDays: t.used_vacation_days ?? null,
            plannedVacationDays: t.planned_vacation_days ?? null,
            maxVacationDays: t.max_vacation_days ?? null,
          })
        })

      return { totals, range, overview }
    }),
    dependencies: [ClockinApiClient.Default, ClockinWorkdays.Default],
  },
) {}
