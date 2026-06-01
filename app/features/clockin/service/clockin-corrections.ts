import { Context, Effect, Layer } from "effect"
import {
  ClockinCorrectionsApi,
  ClockinCorrectionsApiLive,
  type CorrectionWriteError,
} from "../api"
import { CurrentClockinCredentials } from "../client"
import { ClockinWorkdays, ClockinWorkdaysLive } from "./clockin-workdays"
import { currentDay, summarizeDay, type DaySummary } from "./clockin-summary"
import { layTimeline, redistribute, type Bucket } from "./correction-plan"
import { TaskId } from "./clockin-tasks"
import { EventId, type EventRead } from "~/lib/domain/event"
import type { ProjectId } from "~/lib/domain/project"
import type { ClockableTaskId } from "~/lib/domain/task"
import type { TransactionId } from "~/lib/domain/event"
import {
  InvalidCorrectionPlanError,
  SliceId,
  SliceNotFoundError,
  type Workday,
} from "~/lib/domain/workday"

// ---------------------------------------------------------------------------
// Result + error channels
// ---------------------------------------------------------------------------

/** What a correction did — `day` is the rebuilt day, read back best-effort. */
export type CorrectionResult = {
  transactionIds: ReadonlyArray<TransactionId>
  deleted: number
  stored: number
  day: DaySummary | null
}

/** Reads (`/correction`) + writes (storeEvent/deleteEvent) share these. */
type WriteError = CorrectionWriteError

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------
// Editing event history by intent. Each method reads the target day from
// `/correction`, derives the current slices, computes a target timeline (pure,
// via correction-plan), then wipes-and-replaces the day's events. The clock-out
// position rides the slice durations, so relative edits ripple the end of day.

export interface ClockinCorrectionsService {
  /**
   * Redistribute the day's worked time (non-break) across weighted buckets —
   * "make my day 20% A / 30% B / 50% C". Conserves the worked total; breaks are
   * not carried into the rebuilt timeline.
   */
  readonly restructureDay: (plan: {
    date?: string
    buckets: ReadonlyArray<Bucket>
  }) => Effect.Effect<
    CorrectionResult,
    InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >

  /**
   * Resize one existing slice by id — `set` to an absolute length or `add` a
   * delta. Every other slice is preserved; the day ripples by the difference.
   */
  readonly editSlice: (edit: {
    sliceId: SliceId
    op: "set" | "add"
    seconds: number
  }) => Effect.Effect<
    CorrectionResult,
    SliceNotFoundError | InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >

  /** Append a new trailing slice, extending the day by its length. */
  readonly appendSlice: (slice: {
    date?: string
    taskId: ClockableTaskId
    projectId?: ProjectId | null
    seconds: number
  }) => Effect.Effect<
    CorrectionResult,
    InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >
}

export class ClockinCorrections extends Context.Tag("ClockinCorrections")<
  ClockinCorrections,
  ClockinCorrectionsService
>() {}

// ---------------------------------------------------------------------------
// Day derivation (pure)
// ---------------------------------------------------------------------------
// Turn a raw `/correction` workday into the pieces reconciliation needs: the
// day's start, the ordered slices (with their opaque ids), every event id to
// delete, and the worked total. Mirrors the segment walk in clockin-workdays
// but keeps the raw task_id (needed to rebuild) and the upstream event ids.

type DerivedSlice = {
  sliceId: SliceId
  taskId: ClockableTaskId
  projectId: ProjectId | null
  seconds: number
}

type DerivedDay = {
  start: Date | null
  slices: ReadonlyArray<DerivedSlice>
  eventIds: ReadonlyArray<EventId>
  workedSeconds: number
}

const secondsBetween = (start: string, end: string): number => {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 1000))
}

/** Coerce a read event's optional id (number | numeric string) to an EventId. */
const toEventId = (raw: EventRead["id"]): EventId | null => {
  if (raw == null) return null
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? EventId.make(n) : null
}

const deriveDay = (day: Workday | null, nowIso: string): DerivedDay => {
  const events = [...(day?.events ?? [])].sort((a, b) =>
    a.occured_at.localeCompare(b.occured_at),
  )
  const eventIds: EventId[] = []
  const slices: DerivedSlice[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!
    const id = toEventId(ev.id)
    if (id != null) eventIds.push(id)
    if (ev.task_id === TaskId.CLOCKOUT) continue // terminator, not a slice
    const closeAt = events[i + 1]?.occured_at ?? nowIso
    slices.push({
      sliceId: SliceId.make(ev.occured_at),
      taskId: ev.task_id as ClockableTaskId,
      projectId: (ev.project_id ?? null) as ProjectId | null,
      seconds: secondsBetween(ev.occured_at, closeAt),
    })
  }

  const workedSeconds = slices.reduce(
    (n, s) => (s.taskId === TaskId.BREAK ? n : n + s.seconds),
    0,
  )
  return {
    start: events[0] ? new Date(events[0].occured_at) : null,
    slices,
    eventIds,
    workedSeconds,
  }
}

/** The day matching `date`, else the one with the most recent activity. */
const resolveDay = (workdays: ReadonlyArray<Workday>, date?: string): Workday | null => {
  if (date != null) return workdays.find((w) => w.date === date) ?? null
  let best: Workday | null = null
  let bestKey = ""
  for (const w of workdays) {
    const last = w.events?.reduce((m, e) => (e.occured_at > m ? e.occured_at : m), "")
    const key = last || w.date || ""
    if (best === null || key > bestKey) {
      best = w
      bestKey = key
    }
  }
  return best
}

/** The day whose events include the opening event keyed by `sliceId`. */
const findDayContaining = (
  workdays: ReadonlyArray<Workday>,
  sliceId: SliceId,
): Workday | null =>
  workdays.find((w) => w.events?.some((e) => e.occured_at === sliceId)) ?? null

const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

// The seam, dependencies left in `R` (ClockinCorrectionsApi + ClockinWorkdays)
// so tests can drive it through an in-memory api adapter. `ClockinCorrectionsLive`
// below bakes the production adapters in.
export const ClockinCorrectionsLayer = Layer.effect(
  ClockinCorrections,
  Effect.gen(function* () {
    const api = yield* ClockinCorrectionsApi
    const workdays = yield* ClockinWorkdays

    // Rebuilt-day summary, best-effort (a failed read degrades to null) — same
    // read the event tools use for their `today` confirmation.
    const readBack = workdays.summaries().pipe(
      Effect.map((s) => summarizeDay(currentDay(s))),
      Effect.catchAll(() => Effect.succeed<DaySummary | null>(null)),
    )

    // Delete every existing event, then store the planned timeline. Returns the
    // store transaction ids (for undo) and the counts.
    const wipeAndStore = (
      eventIds: ReadonlyArray<EventId>,
      events: ReadonlyArray<Parameters<typeof api.storeEvent>[0]>,
    ) =>
      Effect.gen(function* () {
        for (const id of eventIds) yield* api.deleteEvent(id)
        const transactionIds: TransactionId[] = []
        for (const ev of events) {
          const { transactionId } = yield* api.storeEvent(ev)
          transactionIds.push(transactionId)
        }
        return { transactionIds, deleted: eventIds.length, stored: events.length }
      })

    const finish = (
      result: { transactionIds: ReadonlyArray<TransactionId>; deleted: number; stored: number },
    ) =>
      Effect.map(readBack, (day): CorrectionResult => ({ ...result, day }))

    return ClockinCorrections.of({
      restructureDay: ({ date, buckets }) =>
        Effect.gen(function* () {
          const creds = yield* CurrentClockinCredentials
          const days = yield* api.workdays()
          const derived = deriveDay(resolveDay(days, date), isoNoMs(new Date()))
          const start = derived.start ?? new Date()
          const events = yield* redistribute(
            start,
            derived.workedSeconds,
            buckets,
            creds.employeeId,
          )
          const result = yield* wipeAndStore(derived.eventIds, events)
          return yield* finish(result)
        }),

      editSlice: ({ sliceId, op, seconds }) =>
        Effect.gen(function* () {
          const creds = yield* CurrentClockinCredentials
          const days = yield* api.workdays()
          const day = findDayContaining(days, sliceId)
          if (day == null) return yield* new SliceNotFoundError({ sliceId })
          const derived = deriveDay(day, isoNoMs(new Date()))
          if (!derived.slices.some((s) => s.sliceId === sliceId)) {
            return yield* new SliceNotFoundError({ sliceId })
          }
          const slices = derived.slices.map((s) =>
            s.sliceId === sliceId
              ? { ...s, seconds: op === "set" ? seconds : s.seconds + seconds }
              : s,
          )
          const events = yield* layTimeline(
            derived.start ?? new Date(),
            slices,
            creds.employeeId,
          )
          const result = yield* wipeAndStore(derived.eventIds, events)
          return yield* finish(result)
        }),

      appendSlice: ({ date, taskId, projectId, seconds }) =>
        Effect.gen(function* () {
          const creds = yield* CurrentClockinCredentials
          const days = yield* api.workdays()
          const derived = deriveDay(resolveDay(days, date), isoNoMs(new Date()))
          const slices = [
            ...derived.slices,
            { taskId, projectId: projectId ?? null, seconds },
          ]
          const events = yield* layTimeline(
            derived.start ?? new Date(),
            slices,
            creds.employeeId,
          )
          const result = yield* wipeAndStore(derived.eventIds, events)
          return yield* finish(result)
        }),
    })
  }),
)

export const ClockinCorrectionsLive = ClockinCorrectionsLayer.pipe(
  Layer.provide([ClockinCorrectionsApiLive, ClockinWorkdaysLive]),
)
