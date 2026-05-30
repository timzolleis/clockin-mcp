import { Schema } from "effect"
import { Envelope } from "~/lib/domain/shared"

export const TimesheetsTotals = Schema.Struct({
  flextime_seconds: Schema.optional(Schema.Number),
  used_vacation_days: Schema.optional(Schema.Number),
  planned_vacation_days: Schema.optional(Schema.Number),
  max_vacation_days: Schema.optional(Schema.Number),
})
export type TimesheetsTotals = Schema.Schema.Type<typeof TimesheetsTotals>

export const TimesheetsTotalsResponse = Envelope(TimesheetsTotals)

export class CalendarWeek extends Schema.Class<CalendarWeek>("CalendarWeek")({
  work_seconds: Schema.optional(Schema.Number),
  target_seconds: Schema.optional(Schema.Number),
}) {}

export class TimesheetMonth extends Schema.Class<TimesheetMonth>(
  "TimesheetMonth",
)({
  month: Schema.Number,
  work_seconds: Schema.optional(Schema.Number),
  target_seconds: Schema.optional(Schema.Number),
  calendar_weeks: Schema.optional(
    Schema.Record({ key: Schema.String, value: CalendarWeek }),
  ),
}) {}

export const TimesheetRangeResponse = Envelope(Schema.Array(TimesheetMonth))
