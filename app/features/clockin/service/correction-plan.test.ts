import { Either } from "effect"
import { assert, describe, it } from "vitest"
import { ProjectId } from "~/lib/domain/project"
import { buildSpan, localParts, redistribute } from "./correction-plan"
import { TaskId } from "./clockin-tasks"

const right = <A, E extends { reason?: string }>(e: Either.Either<A, E>): A => {
  if (Either.isLeft(e)) throw new Error(`expected Right, got Left: ${e.left.reason ?? e.left}`)
  return e.right
}
const leftReason = <A>(e: Either.Either<A, { reason: string }>): string => {
  if (Either.isRight(e)) throw new Error("expected Left, got Right")
  return e.left.reason
}

describe("localParts (UTC → employee-local wall clock)", () => {
  it("renders a summer instant in CEST (+2)", () => {
    // The probe proved 08:00 local stored as 06:00Z — so 06:00Z reads back 08:00.
    assert.deepStrictEqual(localParts(new Date("2026-05-30T06:00:00Z"), "Europe/Berlin"), {
      date: "2026-05-30",
      time: "08:00",
    })
  })

  it("renders a winter instant in CET (+1)", () => {
    assert.deepStrictEqual(localParts(new Date("2026-01-15T06:00:00Z"), "Europe/Berlin"), {
      date: "2026-01-15",
      time: "07:00",
    })
  })
})

describe("buildSpan", () => {
  it("renders a UTC span as the local activity payload the endpoint wants", () => {
    const span = buildSpan(
      new Date("2026-05-30T06:00:00Z"),
      new Date("2026-05-30T07:00:00Z"),
      { taskId: TaskId.PROJECT, projectId: ProjectId.make(957830) },
      "Europe/Berlin",
    )
    assert.deepStrictEqual(
      { ...span, correction_reason: undefined },
      {
        start_date: "2026-05-30",
        start_time: "08:00",
        end_date: "2026-05-30",
        end_time: "09:00",
        task_id: TaskId.PROJECT,
        project_id: 957830,
        site_id: null,
        correction_reason: undefined,
      },
    )
  })
})

describe("redistribute", () => {
  it("splits a fixed total by weight, conserving the total", () => {
    const total = 8 * 3600
    const slices = right(
      redistribute(total, [
        { taskId: TaskId.PROJECT, projectId: ProjectId.make(1), weight: 20 },
        { taskId: TaskId.PROJECT, projectId: ProjectId.make(2), weight: 30 },
        { taskId: TaskId.PROJECT, projectId: ProjectId.make(3), weight: 50 },
      ]),
    )
    assert.deepStrictEqual(
      slices.map((s) => s.seconds),
      [0.2 * total, 0.3 * total, 0.5 * total],
    )
    assert.strictEqual(
      slices.reduce((a, s) => a + s.seconds, 0),
      total,
    )
  })

  it("pushes the rounding remainder onto the last bucket so it tiles exactly", () => {
    const slices = right(
      redistribute(10, [
        { taskId: TaskId.WORK, weight: 1 },
        { taskId: TaskId.WORK, weight: 1 },
        { taskId: TaskId.WORK, weight: 1 },
      ]),
    )
    assert.deepStrictEqual(
      slices.map((s) => s.seconds),
      [3, 3, 4],
    )
  })

  it("rejects an empty plan", () => {
    assert.match(leftReason(redistribute(3600, [])), /no buckets/)
  })

  it("rejects redistribution of an empty day (zero total)", () => {
    const e = redistribute(0, [{ taskId: TaskId.WORK, weight: 1 }])
    assert.match(leftReason(e), /no worked time/)
  })

  it("rejects a non-positive bucket weight", () => {
    const e = redistribute(3600, [{ taskId: TaskId.WORK, weight: 0 }])
    assert.match(leftReason(e), /positive weight/)
  })

  it("rejects a project bucket with no project_id", () => {
    const e = redistribute(3600, [{ taskId: TaskId.PROJECT, weight: 1 }])
    assert.match(leftReason(e), /project_id/)
  })
})
