import { Schema } from "effect"
import { EventRead } from "~/lib/domain/event"
import { Envelope } from "~/lib/domain/shared"

export const Workday = Schema.Struct({
  date: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Array(EventRead)),
})
export type Workday = Schema.Schema.Type<typeof Workday>

export const WorkdayArrayResponse = Envelope(Schema.Array(Workday))
