import { Schema } from "effect"
import { AnyTaskId, ClockableTaskId } from "~/lib/domain/task"

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
