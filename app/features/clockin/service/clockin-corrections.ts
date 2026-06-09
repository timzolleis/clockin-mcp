import { Context, Effect, Layer } from "effect"
import {
  ClockinCorrectionsApi,
  ClockinCorrectionsApiLive,
  type CorrectionWriteError,
} from "../api"
import type { CurrentClockinCredentials } from "../client"
import { ClockinWorkdays, ClockinWorkdaysLive } from "./clockin-workdays"
import { currentDay, summarizeDay, type DaySummary } from "./clockin-summary"
import { buildSpan, redistribute, type Bucket } from "./correction-plan"
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

/** What a correction did — `day` is the resulting day, read back best-effort. */
export type CorrectionResult = {
  transactionIds: ReadonlyArray<TransactionId>
  day: DaySummary | null
}

type WriteError = CorrectionWriteError

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------
// Editing a workday as ACTIVITY SPANS (Clockin's native correction model):
//   • editSlice   → one updateEvent on the slice's opening event (the adjacent
//                   activity absorbs the change; the last slice extends/shrinks
//                   the day). Resizes by DURATION; start stays anchored. Ids
//                   stay stable — no wipe.
//   • editSegment → one updateEvent that sets the slice's ABSOLUTE boundaries
//                   (start and/or end), the only primitive that can move a
//                   start. Ripple "none": neighbors are untouched, so moving a
//                   start changes the slice id (re-read after).
//   • appendSlice → one storeEvent at the day's end.
//   • restructureDay → delete the day's events, then storeEvent one span per
//                   bucket from the day's start (conserves the worked total).
// All times are rendered employee-local by `buildSpan`.

export interface ClockinCorrectionsService {
  readonly restructureDay: (plan: {
    date?: string
    buckets: ReadonlyArray<Bucket>
  }) => Effect.Effect<
    CorrectionResult,
    InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >

  readonly editSlice: (edit: {
    sliceId: SliceId
    op: "set" | "add"
    seconds: number
  }) => Effect.Effect<
    CorrectionResult,
    SliceNotFoundError | InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >

  /**
   * Set a slice's absolute boundaries — `startedAt` and/or `endedAt`, each
   * defaulting to its current value. Ripple "none": no neighbor is moved, so the
   * backend rejects a boundary that overlaps another entry. The one primitive
   * that can move a start (and thus its slice id).
   */
  readonly editSegment: (edit: {
    sliceId: SliceId
    startedAt?: Date
    endedAt?: Date
  }) => Effect.Effect<
    CorrectionResult,
    SliceNotFoundError | InvalidCorrectionPlanError | WriteError,
    CurrentClockinCredentials
  >

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
// Turn a raw `/correction` workday into activities: each non-clock-out event
// opens a slice that runs to the next event. We keep the opening event's id
// (to address updateEvent/deleteEvent) and its UTC instant (to render local
// spans), plus the worked total (breaks excluded) for redistribution.

type DerivedSlice = {
  sliceId: SliceId
  eventId: EventId | null
  taskId: ClockableTaskId
  projectId: ProjectId | null
  startUtc: Date
  seconds: number
}

type DerivedDay = {
  startUtc: Date | null
  endUtc: Date | null
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
    if (ev.task_id === TaskId.CLOCKOUT) continue
    const closeAt = events[i + 1]?.occured_at ?? nowIso
    slices.push({
      sliceId: SliceId.make(ev.occured_at),
      eventId: id,
      taskId: ev.task_id as ClockableTaskId,
      projectId: (ev.project_id ?? null) as ProjectId | null,
      startUtc: new Date(ev.occured_at),
      seconds: secondsBetween(ev.occured_at, closeAt),
    })
  }

  const workedSeconds = slices.reduce(
    (n, s) => (s.taskId === TaskId.BREAK ? n : n + s.seconds),
    0,
  )
  const last = events[events.length - 1]
  return {
    startUtc: events[0] ? new Date(events[0].occured_at) : null,
    endUtc: last ? new Date(last.occured_at) : null,
    slices,
    eventIds,
    workedSeconds,
  }
}

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

const findDayContaining = (
  workdays: ReadonlyArray<Workday>,
  sliceId: SliceId,
): Workday | null =>
  workdays.find((w) => w.events?.some((e) => e.occured_at === sliceId)) ?? null

const plus = (instant: Date, seconds: number) => new Date(instant.getTime() + seconds * 1000)
const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const ClockinCorrectionsLayer = Layer.effect(
  ClockinCorrections,
  Effect.gen(function* () {
    const api = yield* ClockinCorrectionsApi
    const workdays = yield* ClockinWorkdays

    // Resulting-day summary, best-effort (same read the event tools use).
    const readBack = workdays.summaries().pipe(
      Effect.map((s) => summarizeDay(currentDay(s))),
      Effect.catchAll(() => Effect.succeed<DaySummary | null>(null)),
    )
    const finish = (transactionIds: ReadonlyArray<TransactionId>) =>
      Effect.map(readBack, (day): CorrectionResult => ({ transactionIds, day }))

    // Resolve a slice id to its derived slice + a guaranteed-present event id —
    // the shared front of every single-slice edit.
    const locate = (sliceId: SliceId) =>
      Effect.gen(function* () {
        const days = yield* api.workdays()
        const day = findDayContaining(days, sliceId)
        if (day == null) return yield* new SliceNotFoundError({ sliceId })
        const slice = deriveDay(day, nowIso()).slices.find((s) => s.sliceId === sliceId)
        if (slice == null) return yield* new SliceNotFoundError({ sliceId })
        if (slice.eventId == null) {
          return yield* new InvalidCorrectionPlanError({
            reason: "this slice has no event id and can't be edited",
          })
        }
        return { slice, eventId: slice.eventId }
      })

    return ClockinCorrections.of({
      restructureDay: ({ date, buckets }) =>
        Effect.gen(function* () {
          const days = yield* api.workdays()
          const derived = deriveDay(resolveDay(days, date), nowIso())
          const start = derived.startUtc ?? new Date()
          const slices = yield* redistribute(derived.workedSeconds, buckets)

          let cursor = start
          const spans = slices.map((s) => {
            const end = plus(cursor, s.seconds)
            const span = buildSpan(cursor, end, s)
            cursor = end
            return span
          })

          for (const id of derived.eventIds) yield* api.deleteEvent(id)
          const transactionIds: TransactionId[] = []
          for (const span of spans) {
            const { transactionId } = yield* api.storeEvent(span)
            transactionIds.push(transactionId)
          }
          return yield* finish(transactionIds)
        }),

      editSlice: ({ sliceId, op, seconds }) =>
        Effect.gen(function* () {
          const { slice, eventId } = yield* locate(sliceId)
          const newSeconds = op === "set" ? seconds : slice.seconds + seconds
          if (!Number.isFinite(newSeconds) || newSeconds <= 0) {
            return yield* new InvalidCorrectionPlanError({
              reason: "the slice needs a positive duration",
            })
          }
          const span = buildSpan(slice.startUtc, plus(slice.startUtc, newSeconds), slice)
          const { transactionId } = yield* api.updateEvent(eventId, span)
          return yield* finish([transactionId])
        }),

      editSegment: ({ sliceId, startedAt, endedAt }) =>
        Effect.gen(function* () {
          if (startedAt == null && endedAt == null) {
            return yield* new InvalidCorrectionPlanError({
              reason: "give a new start, a new end, or both",
            })
          }
          const { slice, eventId } = yield* locate(sliceId)
          // Ripple "none": set this slice's absolute span, defaulting each side
          // to its current boundary; no neighbor is moved. The backend rejects a
          // boundary that overlaps another entry.
          const start = startedAt ?? slice.startUtc
          const end = endedAt ?? plus(slice.startUtc, slice.seconds)
          if (end.getTime() <= start.getTime()) {
            return yield* new InvalidCorrectionPlanError({
              reason: "the segment has to end after it starts",
            })
          }
          const span = buildSpan(start, end, slice)
          const { transactionId } = yield* api.updateEvent(eventId, span)
          return yield* finish([transactionId])
        }),

      appendSlice: ({ date, taskId, projectId, seconds }) =>
        Effect.gen(function* () {
          if (taskId === TaskId.PROJECT && projectId == null) {
            return yield* new InvalidCorrectionPlanError({
              reason: "a project slice needs a project_id",
            })
          }
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return yield* new InvalidCorrectionPlanError({
              reason: "the slice needs a positive duration",
            })
          }
          const days = yield* api.workdays()
          const derived = deriveDay(resolveDay(days, date), nowIso())
          const start = derived.endUtc ?? new Date()
          const span = buildSpan(start, plus(start, seconds), { taskId, projectId })
          const { transactionId } = yield* api.storeEvent(span)
          return yield* finish([transactionId])
        }),
    })
  }),
)

export const ClockinCorrectionsLive = ClockinCorrectionsLayer.pipe(
  Layer.provide([ClockinCorrectionsApiLive, ClockinWorkdaysLive]),
)
