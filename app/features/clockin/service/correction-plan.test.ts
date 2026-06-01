import { Either } from "effect"
import { assert, describe, it } from "vitest"
import { ProjectId } from "~/lib/domain/project"
import { layTimeline, redistribute } from "./correction-plan"
import { TaskId } from "./clockin-tasks"

const EMPLOYEE = 42
const START = new Date("2026-06-01T09:00:00Z")

/** Unwrap a Right or fail the test with the Left's reason. */
const right = <A, E extends { reason?: string }>(e: Either.Either<A, E>): A => {
  if (Either.isLeft(e)) throw new Error(`expected Right, got Left: ${e.left.reason ?? e.left}`)
  return e.right
}

describe("layTimeline", () => {
  it("lays one event per slice at cumulative offsets plus a trailing clock-out", () => {
    const events = right(
      layTimeline(
        START,
        [
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(7), seconds: 2 * 3600 },
          { taskId: TaskId.WORK, seconds: 3 * 3600 },
        ],
        EMPLOYEE,
      ),
    )

    assert.deepStrictEqual(
      events.map((e) => [e.occured_at, e.task_id, e.project_id]),
      [
        ["2026-06-01T09:00:00Z", TaskId.PROJECT, 7],
        ["2026-06-01T11:00:00Z", TaskId.WORK, null],
        ["2026-06-01T14:00:00Z", TaskId.CLOCKOUT, null],
      ],
    )
    assert.strictEqual(events.every((e) => e.employee_id === EMPLOYEE), true)
    assert.strictEqual(events.every((e) => e.id === null && typeof e.uuid === "string"), true)
  })
})

/** Seconds each slice occupies, derived from the gaps between events. */
const durations = (events: ReadonlyArray<{ occured_at: string }>): number[] => {
  const out: number[] = []
  for (let i = 0; i < events.length - 1; i++) {
    out.push((Date.parse(events[i + 1]!.occured_at) - Date.parse(events[i]!.occured_at)) / 1000)
  }
  return out
}

/** Assert the plan was rejected and return the reason. */
const leftReason = <A>(e: Either.Either<A, { reason: string }>): string => {
  if (Either.isRight(e)) throw new Error("expected Left, got Right")
  return e.left.reason
}

describe("plan validation (typed Left, never a throw)", () => {
  it("rejects an empty slice list", () => {
    assert.match(leftReason(layTimeline(START, [], EMPLOYEE)), /no slices/)
  })

  it("rejects a non-positive slice duration", () => {
    const e = layTimeline(START, [{ taskId: TaskId.WORK, seconds: 0 }], EMPLOYEE)
    assert.match(leftReason(e), /positive duration/)
  })

  it("rejects a project slice with no project_id", () => {
    const e = layTimeline(START, [{ taskId: TaskId.PROJECT, seconds: 3600 }], EMPLOYEE)
    assert.match(leftReason(e), /project_id/)
  })

  it("rejects redistribution of an empty day (zero total)", () => {
    const e = redistribute(START, 0, [{ taskId: TaskId.WORK, weight: 1 }], EMPLOYEE)
    assert.match(leftReason(e), /no worked time/)
  })

  it("rejects a non-positive bucket weight", () => {
    const e = redistribute(START, 3600, [{ taskId: TaskId.WORK, weight: 0 }], EMPLOYEE)
    assert.match(leftReason(e), /positive weight/)
  })
})

describe("redistribute", () => {
  it("splits a fixed total by weight, conserving the total length", () => {
    const total = 8 * 3600
    const events = right(
      redistribute(
        START,
        total,
        [
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 20 },
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(2), weight: 30 },
          { taskId: TaskId.PROJECT, projectId: ProjectId.make(3), weight: 50 },
        ],
        EMPLOYEE,
      ),
    )
    assert.deepStrictEqual(durations(events), [0.2 * total, 0.3 * total, 0.5 * total])
    // last event is the clock-out at start + total
    assert.strictEqual(events.at(-1)!.task_id, TaskId.CLOCKOUT)
    assert.strictEqual(
      durations(events).reduce((a, b) => a + b, 0),
      total,
    )
  })

  it("pushes the rounding remainder onto the last bucket so it tiles exactly", () => {
    const events = right(
      redistribute(
        START,
        10,
        [
          { taskId: TaskId.WORK, weight: 1 },
          { taskId: TaskId.WORK, weight: 1 },
          { taskId: TaskId.WORK, weight: 1 },
        ],
        EMPLOYEE,
      ),
    )
    assert.deepStrictEqual(durations(events), [3, 3, 4]) // floor(10/3)=3,3 ; remainder 1 → last
  })
})
