import { Either, Schema } from "effect"
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

// ---------------------------------------------------------------------------
// Local wall-clock parsing (the inverse of `localParts`)
// ---------------------------------------------------------------------------
// The start/edit tools accept an explicit time. Users and models say "08:40",
// not "2026-06-08T06:40:00Z" — so we accept a bare `HH:mm` (employee-local,
// today's date) or a full ISO instant, and resolve both to a UTC `Date`. The
// HH:mm case is where DST bites: the same wall clock is +1h or +2h off UTC
// depending on the date, so we read the zone's offset *at that instant* rather
// than assuming a fixed one.

/** A 24h wall clock, `HH:mm` (00–23 : 00–59). Validated by Effect Schema. */
export const WallClock = Schema.String.pipe(
  Schema.pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
  Schema.brand("WallClock"),
)
export type WallClock = typeof WallClock.Type

const isWallClock = Schema.is(WallClock)
const decodeIso = Schema.decodeUnknownEither(Schema.DateFromString)

/** Offset of `timeZone` at `instant`, in ms (positive = ahead of UTC). */
const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const { date, time } = localParts(instant, timeZone)
  return Date.parse(`${date}T${time}:00Z`) - instant.getTime()
}

/**
 * The UTC instant whose wall clock in `timeZone` is `date` + `time` (local).
 * Treat the wall time as if it were UTC, then subtract the zone's offset *at
 * that instant*; one refinement pass settles the self-reference across a DST
 * boundary. Exact inverse of {@link localParts} for whole-minute inputs.
 */
export const wallClockToUtc = (
  date: string,
  time: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date => {
  const wallAsUtc = Date.parse(`${date}T${time}:00Z`)
  const once = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone)
  const twice = wallAsUtc - zoneOffsetMs(new Date(once), timeZone)
  return new Date(twice)
}

/**
 * Resolve a user/model time string to a UTC instant. Accepts a bare `HH:mm`
 * (anchored to `anchorDate` if given, else `now`'s date in `timeZone`) or a full
 * ISO timestamp. `anchorDate` lets a caller place an `HH:mm` on a day other than
 * today (e.g. append_slice backfilling a past, empty workday). Rides the
 * typed-error channel like {@link redistribute} so the tool layer can speak the
 * failure back instead of throwing.
 */
export const parseAt = (
  input: string,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  anchorDate?: string,
): Either.Either<Date, InvalidCorrectionPlanError> => {
  const trimmed = input.trim()
  if (isWallClock(trimmed)) {
    const date = anchorDate ?? localParts(now, timeZone).date
    return Either.right(wallClockToUtc(date, trimmed, timeZone))
  }
  const iso = decodeIso(trimmed)
  if (Either.isRight(iso) && !Number.isNaN(iso.right.getTime())) {
    return Either.right(iso.right)
  }
  return Either.left(
    new InvalidCorrectionPlanError({
      reason: `couldn't read "${input}" as a time — use HH:mm (e.g. 08:40) or a full ISO timestamp`,
    }),
  )
}

/**
 * Guard a resolved instant before it's written as a point event. Two ways a
 * backdated `at` corrupts the timeline:
 *   • the future — the event hasn't happened yet;
 *   • before `notBefore` — the latest already-recorded entry. Status reads use a
 *     strict `>` tie-break, so an event inserted behind the head reorders the
 *     day. (Point events can't overlap a break *span* — that's edit_segment's
 *     concern, not this one.)
 * Times in the message are rendered employee-local for the user to recognize.
 */
export const validateAt = (
  when: Date,
  now: Date,
  notBefore?: Date | null,
  timeZone: string = DEFAULT_TIME_ZONE,
): Either.Either<Date, InvalidCorrectionPlanError> => {
  if (when.getTime() > now.getTime()) {
    return invalid(`that time is in the future — ${localParts(when, timeZone).time} hasn't happened yet`)
  }
  if (notBefore != null && when.getTime() < notBefore.getTime()) {
    return invalid(
      `${localParts(when, timeZone).time} is before your last entry at ${localParts(notBefore, timeZone).time}` +
        ` — pick a later time, or fix the earlier entry first`,
    )
  }
  return Either.right(when)
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
