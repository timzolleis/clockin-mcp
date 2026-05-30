import { Schema } from "effect"
import { Envelope } from "~/lib/domain/shared"

export const Project = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  parent_id: Schema.optional(Schema.NullOr(Schema.Number)),
})
export type Project = Schema.Schema.Type<typeof Project>

export const ProjectArrayResponse = Envelope(Schema.Array(Project))
export const ProjectResponse = Envelope(Project)
