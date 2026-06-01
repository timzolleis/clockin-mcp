import { it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { assert, describe } from "vitest"
import {
  ClockinCorrectionsApi,
  CorrectionStored,
  CorrectionUpdated,
} from "../api"
import { CurrentClockinCredentials } from "../client"
import { ClockinCorrections, ClockinCorrectionsLayer } from "./clockin-corrections"
import { ClockinWorkdays } from "./clockin-workdays"
import { TaskId } from "./clockin-tasks"
import { ClockinCredentials } from "~/lib/domain/credentials"
import { EmployeeId } from "~/lib/domain/employee"
import { EventId, TransactionId, type EventInput } from "~/lib/domain/event"
import { ProjectId } from "~/lib/domain/project"
import { SliceId, type Workday } from "~/lib/domain/workday"

// ---------------------------------------------------------------------------
// Test harness — an in-memory ClockinCorrectionsApi that records every wipe and
// store, plus a no-op ClockinWorkdays for the best-effort read-back.
// ---------------------------------------------------------------------------

const makeMemoryApi = (workdays: readonly Workday[]) => {
  const stored: EventInput[] = []
  const deleted: EventId[] = []
  const layer = Layer.succeed(
    ClockinCorrectionsApi,
    ClockinCorrectionsApi.of({
      workdays: () => Effect.succeed(workdays),
      storeEvent: (event) =>
        Effect.sync(() => {
          stored.push(event)
          return new CorrectionStored({
            transactionId: TransactionId.make(`tx-${stored.length}`),
            eventUuid: event.uuid,
          })
        }),
      deleteEvent: (id) => Effect.sync(() => void deleted.push(id)),
      updateEvent: () =>
        Effect.sync(
          () =>
            new CorrectionUpdated({
              transactionId: TransactionId.make("unused"),
              firstInstanceToRefresh: null,
              lastInstanceToRefresh: null,
            }),
        ),
      undo: () => Effect.void,
    }),
  )
  return { layer, stored, deleted }
}

const MemoryWorkdays = Layer.succeed(
  ClockinWorkdays,
  ClockinWorkdays.of({ summaries: () => Effect.succeed([]) }),
)

const CREDS = new ClockinCredentials({
  employeeId: EmployeeId.make(42),
  userToken: Redacted.make("u"),
  deviceToken: Redacted.make("d"),
})

/** Run `body` with the service wired over `mem` + creds. */
const withService = (
  mem: ReturnType<typeof makeMemoryApi>,
  body: (corrections: typeof ClockinCorrections.Service) => Effect.Effect<unknown, unknown, CurrentClockinCredentials>,
) =>
  ClockinCorrections.pipe(
    Effect.flatMap(body),
    Effect.provideService(CurrentClockinCredentials, CREDS),
    Effect.provide(ClockinCorrectionsLayer.pipe(Layer.provide(mem.layer), Layer.provide(MemoryWorkdays))),
  )

/** Seconds each stored slice occupies (gaps between consecutive events). */
const durations = (events: readonly EventInput[]): number[] => {
  const out: number[] = []
  for (let i = 0; i < events.length - 1; i++) {
    out.push((Date.parse(events[i + 1]!.occured_at) - Date.parse(events[i]!.occured_at)) / 1000)
  }
  return out
}

const ev = (id: number, occured_at: string, task_id: number, project_id?: number) => ({
  id,
  occured_at,
  task_id,
  ...(project_id != null ? { project_id } : {}),
})

// WORK 09–11 (2h), BREAK 11–12 (1h), WORK 12–15 (3h), clock-out 15:00.
const DAY_WITH_BREAK: Workday = {
  date: "2026-06-01",
  events: [
    ev(1, "2026-06-01T09:00:00Z", TaskId.WORK),
    ev(2, "2026-06-01T11:00:00Z", TaskId.BREAK),
    ev(3, "2026-06-01T12:00:00Z", TaskId.WORK),
    ev(4, "2026-06-01T15:00:00Z", TaskId.CLOCKOUT),
  ],
}

// WORK 09–11 (2h), PROJECT#7 11–14 (3h), clock-out 14:00.
const DAY_PROJECT: Workday = {
  date: "2026-06-01",
  events: [
    ev(1, "2026-06-01T09:00:00Z", TaskId.WORK),
    ev(2, "2026-06-01T11:00:00Z", TaskId.PROJECT, 7),
    ev(3, "2026-06-01T14:00:00Z", TaskId.CLOCKOUT),
  ],
}

describe("ClockinCorrections", () => {
  it.effect("restructureDay redistributes only worked time and drops breaks", () => {
    const mem = makeMemoryApi([DAY_WITH_BREAK])
    return withService(mem, (c) =>
      c.restructureDay({
        buckets: [
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 50 },
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(2), weight: 50 },
        ],
      }),
    ).pipe(
      Effect.map(() => {
        assert.deepStrictEqual(mem.deleted.map(Number), [1, 2, 3, 4]) // every event wiped
        assert.deepStrictEqual(
          mem.stored.map((e) => [e.task_id, e.project_id]),
          [
            [TaskId.PROJECT, 1],
            [TaskId.PROJECT, 2],
            [TaskId.CLOCKOUT, null],
          ],
        )
        // worked total = 2h + 3h = 5h (break excluded), split 50/50
        assert.deepStrictEqual(durations(mem.stored), [9000, 9000])
      }),
    )
  })

  it.effect("editSlice 'set' resizes one slice and ripples the clock-out", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSlice({
        sliceId: SliceId.make("2026-06-01T11:00:00Z"), // the PROJECT#7 slice
        op: "set",
        seconds: 3600, // 3h → 1h
      }),
    ).pipe(
      Effect.map(() => {
        assert.deepStrictEqual(mem.deleted.map(Number), [1, 2, 3])
        assert.deepStrictEqual(
          mem.stored.map((e) => [e.task_id, e.project_id]),
          [
            [TaskId.WORK, null],
            [TaskId.PROJECT, 7],
            [TaskId.CLOCKOUT, null],
          ],
        )
        assert.deepStrictEqual(durations(mem.stored), [7200, 3600]) // day shrank 3h→1h
      }),
    )
  })

  it.effect("editSlice rejects an unknown slice id", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSlice({ sliceId: SliceId.make("nope"), op: "set", seconds: 3600 }).pipe(
        Effect.flip,
        Effect.map((e) => assert.strictEqual(e._tag, "SliceNotFoundError")),
      ),
    )
  })

  it.effect("appendSlice adds a trailing slice and extends the day", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.appendSlice({
        taskId: TaskId.PROJECT,
        projectId: ProjectId.make(9),
        seconds: 2100, // 35 min
      }),
    ).pipe(
      Effect.map(() => {
        assert.deepStrictEqual(
          mem.stored.map((e) => [e.task_id, e.project_id]),
          [
            [TaskId.WORK, null],
            [TaskId.PROJECT, 7],
            [TaskId.PROJECT, 9],
            [TaskId.CLOCKOUT, null],
          ],
        )
        assert.deepStrictEqual(durations(mem.stored), [7200, 10800, 2100]) // existing kept, +35m
      }),
    )
  })
})
