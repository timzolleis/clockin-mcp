import { it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { assert, describe } from "vitest"
import {
  ClockinCorrectionsApi,
  CorrectionStored,
  CorrectionUpdated,
  type CorrectionActivity,
} from "../api"
import { CurrentClockinCredentials } from "../client"
import { ClockinCorrections, ClockinCorrectionsLayer } from "./clockin-corrections"
import { ClockinWorkdays } from "./clockin-workdays"
import { TaskId } from "./clockin-tasks"
import { ClockinCredentials } from "~/lib/domain/credentials"
import { EmployeeId } from "~/lib/domain/employee"
import { EventId, TransactionId } from "~/lib/domain/event"
import { ProjectId } from "~/lib/domain/project"
import { SliceId, type Workday } from "~/lib/domain/workday"

// ---------------------------------------------------------------------------
// In-memory ClockinCorrectionsApi — records every span stored/updated/deleted.
// ---------------------------------------------------------------------------

const makeMemoryApi = (workdays: readonly Workday[]) => {
  const stored: CorrectionActivity[] = []
  const updated: Array<{ id: number; activity: CorrectionActivity }> = []
  const deleted: number[] = []
  const layer = Layer.succeed(
    ClockinCorrectionsApi,
    ClockinCorrectionsApi.of({
      workdays: () => Effect.succeed(workdays),
      storeEvent: (activity) =>
        Effect.sync(() => {
          stored.push(activity)
          return new CorrectionStored({
            transactionId: TransactionId.make(1000 + stored.length),
            eventUuid: "uuid",
          })
        }),
      updateEvent: (id, activity) =>
        Effect.sync(() => {
          updated.push({ id: Number(id), activity })
          return new CorrectionUpdated({
            transactionId: TransactionId.make(2000 + updated.length),
            firstInstanceToRefresh: null,
            lastInstanceToRefresh: null,
          })
        }),
      deleteEvent: (id) => Effect.sync(() => void deleted.push(Number(id))),
      undo: () => Effect.void,
    }),
  )
  return { layer, stored, updated, deleted }
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

const withService = (
  mem: ReturnType<typeof makeMemoryApi>,
  body: (c: typeof ClockinCorrections.Service) => Effect.Effect<unknown, unknown, CurrentClockinCredentials>,
) =>
  ClockinCorrections.pipe(
    Effect.flatMap(body),
    Effect.provideService(CurrentClockinCredentials, CREDS),
    Effect.provide(ClockinCorrectionsLayer.pipe(Layer.provide(mem.layer), Layer.provide(MemoryWorkdays))),
  )

// Duration of an activity span in seconds — offset cancels since we read both
// ends in the same (UTC) frame, so it's correct regardless of the local zone.
const spanSeconds = (a: CorrectionActivity): number =>
  (Date.parse(`${a.end_date}T${a.end_time}:00Z`) - Date.parse(`${a.start_date}T${a.start_time}:00Z`)) /
  1000

const ev = (id: number, occured_at: string, task_id: number, project_id?: number) => ({
  id,
  occured_at,
  task_id,
  ...(project_id != null ? { project_id } : {}),
})

// WORK 09–11 (2h), BREAK 11–12 (1h), WORK 12–15 (3h), clock-out 15:00. Worked 5h.
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
  it.effect("restructureDay wipes the day and stores one span per bucket of worked time", () => {
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
        assert.deepStrictEqual(mem.deleted, [1, 2, 3, 4]) // whole day wiped
        assert.deepStrictEqual(
          mem.stored.map((a) => [a.task_id, a.project_id, spanSeconds(a)]),
          [
            [TaskId.PROJECT, 1, 9000], // 5h worked, split 50/50, breaks dropped
            [TaskId.PROJECT, 2, 9000],
          ],
        )
        assert.strictEqual(mem.updated.length, 0)
      }),
    )
  })

  it.effect("editSlice 'set' resizes one slice via a single updateEvent — no wipe", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSlice({ sliceId: SliceId.make("2026-06-01T11:00:00Z"), op: "set", seconds: 3600 }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(mem.deleted.length, 0)
        assert.strictEqual(mem.stored.length, 0)
        assert.strictEqual(mem.updated.length, 1)
        const { id, activity } = mem.updated[0]!
        assert.strictEqual(id, 2) // PROJECT#7's opening event
        assert.deepStrictEqual(
          [activity.task_id, activity.project_id, spanSeconds(activity)],
          [TaskId.PROJECT, 7, 3600], // 3h → 1h
        )
      }),
    )
  })

  it.effect("editSlice 'add' grows the slice by the delta", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSlice({ sliceId: SliceId.make("2026-06-01T11:00:00Z"), op: "add", seconds: 1200 }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(spanSeconds(mem.updated[0]!.activity), 10800 + 1200) // 3h + 20m
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

  it.effect("editSegment moves a start, keeping the end (ripple none) — one updateEvent", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    // Backdate the day's opening: WORK starts 09:00Z (11:00 CEST); pull it to
    // 06:40Z (08:40 CEST). The end stays at the next event, 11:00Z (13:00 CEST).
    return withService(mem, (c) =>
      c.editSegment({
        sliceId: SliceId.make("2026-06-01T09:00:00Z"),
        startedAt: new Date("2026-06-01T06:40:00Z"),
      }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(mem.deleted.length, 0)
        assert.strictEqual(mem.stored.length, 0)
        assert.strictEqual(mem.updated.length, 1)
        const { id, activity } = mem.updated[0]!
        assert.strictEqual(id, 1) // the day's opening event
        assert.strictEqual(activity.start_time, "08:40") // 06:40Z → 08:40 CEST
        assert.strictEqual(activity.end_time, "13:00") // kept: 11:00Z → 13:00 CEST
        assert.strictEqual(spanSeconds(activity), 4 * 3600 + 20 * 60) // 08:40 → 13:00 = 4h20m
      }),
    )
  })

  it.effect("editSegment sets both boundaries when given both", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSegment({
        sliceId: SliceId.make("2026-06-01T11:00:00Z"),
        startedAt: new Date("2026-06-01T11:30:00Z"),
        endedAt: new Date("2026-06-01T13:30:00Z"),
      }),
    ).pipe(
      Effect.map(() => {
        const { id, activity } = mem.updated[0]!
        assert.strictEqual(id, 2)
        assert.deepStrictEqual([activity.start_time, activity.end_time], ["13:30", "15:30"])
        assert.strictEqual(spanSeconds(activity), 2 * 3600) // 2h
      }),
    )
  })

  it.effect("editSegment rejects an empty edit (no start, no end)", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSegment({ sliceId: SliceId.make("2026-06-01T09:00:00Z") }).pipe(
        Effect.flip,
        Effect.map((e) => {
          assert.strictEqual(e._tag, "InvalidCorrectionPlanError")
          assert.strictEqual(mem.updated.length, 0)
        }),
      ),
    )
  })

  it.effect("editSegment rejects an end at or before the start", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSegment({
        sliceId: SliceId.make("2026-06-01T11:00:00Z"),
        startedAt: new Date("2026-06-01T12:00:00Z"),
        endedAt: new Date("2026-06-01T11:00:00Z"),
      }).pipe(
        Effect.flip,
        Effect.map((e) => assert.match((e as { reason: string }).reason, /end after it starts/)),
      ),
    )
  })

  it.effect("editSegment rejects an unknown segment id", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.editSegment({
        sliceId: SliceId.make("nope"),
        startedAt: new Date("2026-06-01T08:00:00Z"),
      }).pipe(
        Effect.flip,
        Effect.map((e) => assert.strictEqual(e._tag, "SliceNotFoundError")),
      ),
    )
  })

  it.effect("appendSlice stores one span at the end of the day", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.appendSlice({ taskId: TaskId.PROJECT, projectId: ProjectId.make(9), seconds: 2100 }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(mem.deleted.length, 0)
        assert.strictEqual(mem.updated.length, 0)
        assert.strictEqual(mem.stored.length, 1)
        const a = mem.stored[0]!
        assert.deepStrictEqual(
          [a.task_id, a.project_id, spanSeconds(a)],
          [TaskId.PROJECT, 9, 2100], // 35m appended after the 14:00 clock-out
        )
        // starts at the day's end (14:00Z → 16:00 CEST)
        assert.strictEqual(a.start_time, "16:00")
      }),
    )
  })
})
