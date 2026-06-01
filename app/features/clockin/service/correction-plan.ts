import { Either } from "effect"
import { InvalidCorrectionPlanError } from "~/lib/domain/workday"
import type { EventInput } from "~/lib/domain/event"
import type { ProjectId } from "~/lib/domain/project"
import type { ClockableTaskId } from "~/lib/domain/task"
import { TaskId } from "./clockin-tasks"

// ---------------------------------------------------------------------------
// Pure timeline math for corrections
// ---------------------------------------------------------------------------
// A workday is a sequence of timestamped events whose gaps ARE the durations.
// These two pure functions turn a desired allocation into the exact event list
// the /correction transport should lay down — no I/O, no randomness beyond the
// per-event uuid. The reconciliation (read → wipe → store) lives in the service.

/** A weighted share of a fixed total (proportional mode). */
export type Bucket = {
  taskId: ClockableTaskId
  projectId?: ProjectId | null
  weight: number
}

/** An explicit slice of known length (absolute mode). */
export type Slice = {
  taskId: ClockableTaskId
  projectId?: ProjectId | null
  seconds: number
}

const invalid = (reason: string) =>
  Either.left(new InvalidCorrectionPlanError({ reason }))

/** Strip milliseconds from an ISO timestamp — matches clockin-events `build()`. */
const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")

/** Build a storeMany-shaped event. Mirrors clockin-events: id:null, fresh uuid,
 *  project_date_id omitted unless set. */
const event = (
  taskId: ClockableTaskId,
  projectId: number | null,
  occurredAt: Date,
  employeeId: number,
): EventInput => ({
  id: null,
  uuid: crypto.randomUUID(),
  occured_at: isoNoMs(occurredAt),
  task_id: taskId,
  project_id: projectId,
  task_label: "",
  employee_id: employeeId,
  is_workplan_event: null,
  site_id: null,
})

/**
 * Lay an explicit ordered slice list from `start`, one event per slice at
 * cumulative offsets, with a trailing CLOCKOUT at `start + Σseconds`. The
 * clock-out position ripples with the slice durations, so growing/shrinking a
 * slice moves the end of the day. 422-style failures (empty, non-positive
 * duration, PROJECT without a project) come back as a typed Left.
 */
export const layTimeline = (
  start: Date,
  slices: readonly Slice[],
  employeeId: number,
): Either.Either<readonly EventInput[], InvalidCorrectionPlanError> => {
  if (slices.length === 0) return invalid("plan has no slices")

  const events: EventInput[] = []
  let offsetMs = start.getTime()
  for (const slice of slices) {
    if (!Number.isFinite(slice.seconds) || slice.seconds <= 0) {
      return invalid("every slice needs a positive duration")
    }
    if (slice.taskId === TaskId.PROJECT && slice.projectId == null) {
      return invalid("a project slice needs a project_id")
    }
    events.push(
      event(slice.taskId, slice.projectId ?? null, new Date(offsetMs), employeeId),
    )
    offsetMs += slice.seconds * 1000
  }
  events.push(event(TaskId.CLOCKOUT, null, new Date(offsetMs), employeeId))
  return Either.right(events)
}

/**
 * Split a fixed `totalSeconds` across weighted buckets — each bucket gets
 * `floor(total * weight / Σweight)` seconds, and the rounding remainder lands
 * on the last bucket so the slices tile the total exactly (zero drift). Then
 * defers to {@link layTimeline}; conserves the total length by construction.
 */
export const redistribute = (
  start: Date,
  totalSeconds: number,
  buckets: readonly Bucket[],
  employeeId: number,
): Either.Either<readonly EventInput[], InvalidCorrectionPlanError> => {
  if (buckets.length === 0) return invalid("plan has no buckets")
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return invalid("nothing to redistribute — the day has no worked time")
  }
  let totalWeight = 0
  for (const b of buckets) {
    if (!Number.isFinite(b.weight) || b.weight <= 0) {
      return invalid("every bucket needs a positive weight")
    }
    totalWeight += b.weight
  }

  // Floor each share, then drop the rounding remainder on the last bucket so the
  // slices tile `totalSeconds` exactly.
  let allocated = 0
  const slices: Slice[] = buckets.map((b) => {
    const seconds = Math.floor((totalSeconds * b.weight) / totalWeight)
    allocated += seconds
    return { taskId: b.taskId, projectId: b.projectId, seconds }
  })
  slices[slices.length - 1]!.seconds += totalSeconds - allocated

  return layTimeline(start, slices, employeeId)
}

