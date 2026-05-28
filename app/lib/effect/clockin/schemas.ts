import { Schema } from "effect"

// ---------------------------------------------------------------------------
// Task IDs
// ---------------------------------------------------------------------------

export const ClockableTaskId = Schema.Literal(2, 3, 4, 5, 6, 7, 8, 9, 10)
export type ClockableTaskId = Schema.Schema.Type<typeof ClockableTaskId>

// Reads may include server-only sentinels (11–13); accept any number.
export const AnyTaskId = Schema.Number

// ---------------------------------------------------------------------------
// Envelope helper
// ---------------------------------------------------------------------------
// The Clockin API consistently wraps responses in `{ data: ... }`.

export const Envelope = <A, I, R>(inner: Schema.Schema<A, I, R>) =>
  Schema.Struct({ data: inner })

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// Matches the iOS app's storeMany payload exactly. Notably `id: null` is
// required, `project_date_id` is omitted entirely when there's no project,
// and `task_label` is a free-form string the app uses for display.
export const EventInput = Schema.Struct({
  id: Schema.NullOr(Schema.Number),
  uuid: Schema.String,
  occured_at: Schema.String,
  task_id: ClockableTaskId,
  project_id: Schema.NullOr(Schema.Number),
  project_date_id: Schema.optional(Schema.NullOr(Schema.Number)),
  task_label: Schema.String,
  employee_id: Schema.Number,
  is_workplan_event: Schema.NullOr(Schema.Boolean),
  site_id: Schema.NullOr(Schema.Number),
})
export type EventInput = Schema.Schema.Type<typeof EventInput>

export const EventInputArray = Schema.Array(EventInput)

// Event as returned by /workdays nested events.
export const EventRead = Schema.Struct({
  uuid: Schema.optional(Schema.String),
  id: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  occured_at: Schema.String,
  task_id: AnyTaskId,
  project_id: Schema.optional(Schema.NullOr(Schema.Number)),
  project_date_id: Schema.optional(Schema.NullOr(Schema.Number)),
  employee_id: Schema.optional(Schema.Number),
})
export type EventRead = Schema.Schema.Type<typeof EventRead>

// The storeMany / correction endpoints return unknown shapes (TODO in spec).
// Keep them permissive so we don't break on unexpected fields.
export const StoreEventsResponse = Schema.Unknown
export const CorrectionWriteResponse = Schema.Unknown

// ---------------------------------------------------------------------------
// Workdays
// ---------------------------------------------------------------------------

export const Workday = Schema.Struct({
  date: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Array(EventRead)),
})
export type Workday = Schema.Schema.Type<typeof Workday>

export const WorkdayArrayResponse = Envelope(Schema.Array(Workday))

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const Project = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  parent_id: Schema.optional(Schema.NullOr(Schema.Number)),
})
export type Project = Schema.Schema.Type<typeof Project>

export const ProjectArrayResponse = Envelope(Schema.Array(Project))
export const ProjectResponse = Envelope(Project)

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Time overview (current week + month + annual)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Employee / task configs
// ---------------------------------------------------------------------------

export const Employee = Schema.Struct({
  id: Schema.Number,
  name: Schema.optional(Schema.String),
})
export type Employee = Schema.Schema.Type<typeof Employee>

export const EmployeeResponse = Envelope(Employee)
export const EmployeeArrayResponse = Envelope(Schema.Array(Employee))

export const TaskConfig = Schema.Struct({
  task_id: AnyTaskId,
})
export const TaskConfigsResponse = Envelope(Schema.Array(TaskConfig))

// ---------------------------------------------------------------------------
// Device config — /device/config returns a Configuration. For personal
// accounts, `user_id` is the current employee_id used in event payloads.
// ---------------------------------------------------------------------------

export const DeviceConfig = Schema.Struct({
  company_id: Schema.optional(Schema.Number),
  device_id: Schema.optional(Schema.Number),
  user_id: Schema.optional(Schema.Number),
  employee_id: Schema.optional(Schema.Number),
})
export type DeviceConfig = Schema.Schema.Type<typeof DeviceConfig>

export const DeviceConfigResponse = Envelope(DeviceConfig)

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const PersonalLoginData = Schema.Struct({
  auth_token: Schema.String,
  user_token: Schema.String,
  device_token: Schema.String,
  type: Schema.Literal("personal"),
})
export type PersonalLoginData = Schema.Schema.Type<typeof PersonalLoginData>

export const PersonalLoginResponse = Envelope(PersonalLoginData)

export const LogoutResponse = Schema.Unknown

// ---------------------------------------------------------------------------
// Status (derived client-side)
// ---------------------------------------------------------------------------

export const WorkState = Schema.Literal(
  "clocked_out",
  "working",
  "on_break",
  "working_on_project",
  "driving",
  "loading",
  "business_trip",
  "special",
  "unknown",
)
export type WorkState = Schema.Schema.Type<typeof WorkState>

export class ProjectRef extends Schema.Class<ProjectRef>("ProjectRef")({
  id: Schema.Number,
  name: Schema.String,
}) {}

export class CurrentStatus extends Schema.Class<CurrentStatus>(
  "CurrentStatus",
)({
  state: WorkState,
  /** Human-readable summary including duration, e.g. `Working on "Foo" for 2h 15m (since 09:42).` */
  description: Schema.String,
  /** ISO timestamp the current state started. */
  since: Schema.NullOr(Schema.String),
  /** Seconds elapsed since `since`. 0 when clocked out. */
  forSeconds: Schema.Number,
  /** Resolved project when state === "working_on_project". */
  project: Schema.NullOr(ProjectRef),
}) {}

// ---------------------------------------------------------------------------
// Workday summaries (LLM-friendly per-day rollups)
// ---------------------------------------------------------------------------

export class WorkdaySegment extends Schema.Class<WorkdaySegment>(
  "WorkdaySegment",
)({
  type: WorkState,
  project: Schema.NullOr(ProjectRef),
  startedAt: Schema.String,
  endedAt: Schema.NullOr(Schema.String),
  durationSeconds: Schema.Number,
  ongoing: Schema.Boolean,
}) {}

export class ProjectTotal extends Schema.Class<ProjectTotal>("ProjectTotal")({
  projectId: Schema.Number,
  projectName: Schema.String,
  seconds: Schema.Number,
}) {}

export class WorkdayTotals extends Schema.Class<WorkdayTotals>(
  "WorkdayTotals",
)({
  clockedInSeconds: Schema.Number,
  workSeconds: Schema.Number,
  breakSeconds: Schema.Number,
  perProject: Schema.Array(ProjectTotal),
}) {}

export class WorkdaySummary extends Schema.Class<WorkdaySummary>(
  "WorkdaySummary",
)({
  date: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  endedAt: Schema.NullOr(Schema.String),
  ongoing: Schema.Boolean,
  segments: Schema.Array(WorkdaySegment),
  totals: WorkdayTotals,
}) {}
