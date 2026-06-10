import { it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer, Redacted } from "effect"
import { assert, describe } from "vitest"
import {
  ClockinCorrectionsApi,
  CorrectionStored,
  CorrectionUpdated,
  type CorrectionActivity,
} from "../api"
import {
  ClockinNotFoundError,
  ClockinValidationError,
  CurrentClockinCredentials,
} from "../client"
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

const makeMemoryApi = (
  workdays: readonly Workday[],
  // Fail the Nth (1-based) call to exercise the failure paths: storeEvent with
  // a typed error, deleteEvent with a 404 (cascade) or a defect (undocumented
  // status / transport failure).
  opts: {
    failStoreOnCall?: number
    notFoundDeleteOnCall?: number
    dieDeleteOnCall?: number
  } = {},
) => {
  const stored: CorrectionActivity[] = []
  const updated: Array<{ id: number; activity: CorrectionActivity }> = []
  const deleted: number[] = []
  const undone: number[] = []
  let storeCalls = 0
  let deleteCalls = 0
  const layer = Layer.succeed(
    ClockinCorrectionsApi,
    ClockinCorrectionsApi.of({
      workdays: () => Effect.succeed(workdays),
      storeEvent: (activity) =>
        Effect.suspend(() => {
          storeCalls += 1
          if (opts.failStoreOnCall === storeCalls) {
            return Effect.fail(
              new ClockinValidationError({ message: "storeEvent rejected", cause: null }),
            )
          }
          stored.push(activity)
          return Effect.succeed(
            new CorrectionStored({
              transactionId: TransactionId.make(1000 + stored.length),
              eventUuid: "uuid",
            }),
          )
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
      deleteEvent: (id) =>
        Effect.suspend(() => {
          deleteCalls += 1
          if (opts.notFoundDeleteOnCall === deleteCalls) {
            return Effect.fail(
              new ClockinNotFoundError({
                message: `No query results for model [Modules\\Time\\Models\\Event] ${id}`,
                cause: null,
              }),
            )
          }
          if (opts.dieDeleteOnCall === deleteCalls) {
            return Effect.die(new Error("upstream 500 mid-wipe"))
          }
          deleted.push(Number(id))
          return Effect.void
        }),
      undo: (id) => Effect.sync(() => void undone.push(Number(id))),
    }),
  )
  return { layer, stored, updated, deleted, undone }
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

  it.effect("appendSlice anchors the slice at an explicit startedAt", () => {
    const mem = makeMemoryApi([DAY_PROJECT])
    return withService(mem, (c) =>
      c.appendSlice({
        startedAt: new Date("2026-06-01T07:00:00Z"),
        taskId: TaskId.PROJECT,
        projectId: ProjectId.make(9),
        seconds: 3600,
      }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(mem.stored.length, 1)
        const a = mem.stored[0]!
        // 07:00Z → 09:00 CEST, 1h long, ignores the day's end
        assert.deepStrictEqual(
          [a.start_time, a.end_time, spanSeconds(a)],
          ["09:00", "10:00", 3600],
        )
      }),
    )
  })

  it.effect("appendSlice places the first slice on an empty day given a start", () => {
    const empty: Workday = { date: "2026-06-01", events: [] }
    const mem = makeMemoryApi([empty])
    return withService(mem, (c) =>
      c.appendSlice({
        date: "2026-06-01",
        startedAt: new Date("2026-06-01T07:00:00Z"),
        taskId: TaskId.WORK,
        seconds: 3600,
      }),
    ).pipe(
      Effect.map(() => {
        assert.strictEqual(mem.stored.length, 1)
        const a = mem.stored[0]!
        assert.deepStrictEqual([a.start_date, a.start_time, a.end_time], ["2026-06-01", "09:00", "10:00"])
      }),
    )
  })

  it.effect("appendSlice rejects an empty day with no start time", () => {
    const empty: Workday = { date: "2026-06-01", events: [] }
    const mem = makeMemoryApi([empty])
    return withService(mem, (c) =>
      c.appendSlice({ date: "2026-06-01", taskId: TaskId.WORK, seconds: 3600 }).pipe(
        Effect.flip,
        Effect.map((e) => {
          assert.strictEqual(e._tag, "InvalidCorrectionPlanError")
          assert.match((e as { reason: string }).reason, /no entries yet/)
          assert.strictEqual(mem.stored.length, 0)
        }),
      ),
    )
  })

  it.effect("restructureDay rolls back the wipe when a store fails", () => {
    // Fail the 2nd store; the day was already wiped, so the original must be
    // re-created and the one stored span undone.
    const mem = makeMemoryApi([DAY_PROJECT], { failStoreOnCall: 2 })
    return withService(mem, (c) =>
      c.restructureDay({
        buckets: [
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 50 },
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(2), weight: 50 },
        ],
      }).pipe(
        Effect.flip,
        Effect.map((e) => {
          assert.strictEqual(e._tag, "ClockinValidationError")
          assert.deepStrictEqual(mem.deleted, [1, 2, 3]) // day was wiped
          assert.deepStrictEqual(mem.undone, [1001]) // the one new span we stored, undone
          // original WORK 09–11 + PROJECT#7 11–14 re-created (the first store +
          // the two rollback stores → indices 1000, 1002, 1003)
          const restored = mem.stored.map((a) => [a.task_id, a.project_id, spanSeconds(a)])
          assert.deepStrictEqual(restored, [
            [TaskId.PROJECT, 1, 9000], // the partial new span (later undone)
            [TaskId.WORK, null, 2 * 3600], // restored original WORK
            [TaskId.PROJECT, 7, 3 * 3600], // restored original PROJECT#7
          ])
        }),
      ),
    )
  })

  it.effect("restructureDay treats a 404 mid-wipe as already deleted and completes", () => {
    // Deleting an event cascades to its boundary events upstream, so a later
    // id in the wipe loop can 404. The restructure must finish, not abort.
    const mem = makeMemoryApi([DAY_WITH_BREAK], { notFoundDeleteOnCall: 4 })
    return withService(mem, (c) =>
      c.restructureDay({
        buckets: [
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 50 },
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(2), weight: 50 },
        ],
      }),
    ).pipe(
      Effect.map(() => {
        assert.deepStrictEqual(mem.deleted, [1, 2, 3]) // 4 was already gone
        assert.deepStrictEqual(
          mem.stored.map((a) => [a.task_id, a.project_id, spanSeconds(a)]),
          [
            [TaskId.PROJECT, 1, 9000],
            [TaskId.PROJECT, 2, 9000],
          ],
        )
        assert.deepStrictEqual(mem.undone, []) // no rollback
      }),
    )
  })

  it.effect("restructureDay rolls back the wipe when a delete dies (defect)", () => {
    // An undocumented status (e.g. a 500) dies as a defect rather than failing
    // with a typed error. The rollback must still fire — otherwise the day is
    // left half-deleted — and the defect must re-surface.
    const mem = makeMemoryApi([DAY_PROJECT], { dieDeleteOnCall: 2 })
    return withService(mem, (c) =>
      c.restructureDay({
        buckets: [{ taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 100 }],
      }),
    ).pipe(
      Effect.exit,
      Effect.map((exit) => {
        assert.isTrue(Exit.isFailure(exit) && Cause.isDie(exit.cause)) // defect re-surfaced
        assert.deepStrictEqual(mem.deleted, [1]) // wipe aborted after the first delete
        assert.deepStrictEqual(mem.undone, []) // nothing new was stored yet
        // original WORK 09–11 + PROJECT#7 11–14 re-created by the rollback
        assert.deepStrictEqual(
          mem.stored.map((a) => [a.task_id, a.project_id, spanSeconds(a)]),
          [
            [TaskId.WORK, null, 2 * 3600],
            [TaskId.PROJECT, 7, 3 * 3600],
          ],
        )
      }),
    )
  })
})
