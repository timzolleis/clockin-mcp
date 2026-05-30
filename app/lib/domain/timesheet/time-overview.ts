import { Schema } from "effect"

// Derived current week + month + annual rollup, assembled client-side.

export class WeekBalance extends Schema.Class<WeekBalance>("WeekBalance")({
  weekStarting: Schema.String,
  workedHours: Schema.Number,
  targetHours: Schema.Number,
  remainingHours: Schema.Number,
}) {}

export class MonthBalance extends Schema.Class<MonthBalance>("MonthBalance")({
  month: Schema.Number,
  workedHours: Schema.Number,
  targetHours: Schema.Number,
  remainingHours: Schema.Number,
  overtimeHours: Schema.Number,
}) {}

export class TimeOverview extends Schema.Class<TimeOverview>("TimeOverview")({
  currentWeek: Schema.NullOr(WeekBalance),
  currentMonth: Schema.NullOr(MonthBalance),
  annualFlextimeHours: Schema.NullOr(Schema.Number),
  usedVacationDays: Schema.NullOr(Schema.Number),
  plannedVacationDays: Schema.NullOr(Schema.Number),
  maxVacationDays: Schema.NullOr(Schema.Number),
}) {}
