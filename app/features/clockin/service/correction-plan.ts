import { Either } from "effect"
import { InvalidCorrectionPlanError } from "~/lib/domain/workday"
import type { CorrectionActivity } from "../api"
import type { ProjectId } from "~/lib/domain/project"
import type { ClockableTaskId } from "~/lib/domain/task"

// ---------------------------------------------------------------------------
// Pure correction math
// ---------------------------------------------------------------------------
// Clockin corrections are ACTIVITY SPANS, not point events: each is a
// {start,end,task,project} the backend materializes into boundary events. These
// pure helpers do the two things the service can't get from the API: split a
// total into weighted buckets, and render a UTC instant as the local
// date/time the correction endpoint expects (`HH:mm`, employee-local).

/** Clockin is a German product; employee times are entered in this zone. */
export const DEFAULT_TIME_ZONE = "Europe/Berlin"

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

const invalid = (reason: string) => Either.left(new InvalidCorrectionPlanError({ reason }))

// ---------------------------------------------------------------------------
// Local wall-clock rendering
// ---------------------------------------------------------------------------

/** Render a UTC instant as `{ date: "YYYY-MM-DD", time: "HH:mm" }` in `timeZone`. */
export const localParts = (
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): { date: string; time: string } => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant)
  const v = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  // Some engines render midnight as "24"; normalize to "00".
  const hour = v("hour") === "24" ? "00" : v("hour")
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${hour}:${v("minute")}` }
}

/** A correction reason stamped on every activity we write. */
export const CORRECTION_REASON = "Adjusted via Clockin assistant"

/**
 * Build the activity-span request body for a `[startUtc, endUtc]` slice — the
 * exact shape the app's `Correction.getPayload()` posts (split local date/time,
 * a `correction_reason`). `id` is left for the caller to set on updates.
 */
export const buildSpan = (
  startUtc: Date,
  endUtc: Date,
  slice: { taskId: ClockableTaskId; projectId?: ProjectId | number | null },
  timeZone: string = DEFAULT_TIME_ZONE,
): CorrectionActivity => {
  const start = localParts(startUtc, timeZone)
  const end = localParts(endUtc, timeZone)
  return {
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    task_id: slice.taskId,
    project_id: (slice.projectId ?? null) as number | null,
    site_id: null,
    correction_reason: CORRECTION_REASON,
  }
}

// ---------------------------------------------------------------------------
// Weighted redistribution
// ---------------------------------------------------------------------------

/**
 * Split a fixed `totalSeconds` across weighted buckets — each gets
 * `floor(total * weight / Σweight)` seconds, with the rounding remainder on the
 * last bucket so the slices tile the total exactly (zero drift). Conserves the
 * total length; the service lays the resulting slices end-to-end from the day's
 * start.
 */
export const redistribute = (
  totalSeconds: number,
  buckets: readonly Bucket[],
): Either.Either<readonly Slice[], InvalidCorrectionPlanError> => {
  if (buckets.length === 0) return invalid("plan has no buckets")
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return invalid("nothing to redistribute — the day has no worked time")
  }
  let totalWeight = 0
  for (const b of buckets) {
    if (!Number.isFinite(b.weight) || b.weight <= 0) {
      return invalid("every bucket needs a positive weight")
    }
    if (b.projectId == null && b.taskId === 4) {
      return invalid("a project bucket needs a project_id")
    }
    totalWeight += b.weight
  }

  let allocated = 0
  const slices: Slice[] = buckets.map((b) => {
    const seconds = Math.floor((totalSeconds * b.weight) / totalWeight)
    allocated += seconds
    return { taskId: b.taskId, projectId: b.projectId, seconds }
  })
  slices[slices.length - 1]!.seconds += totalSeconds - allocated
  return Either.right(slices)
}
