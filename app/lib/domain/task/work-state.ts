import { Schema } from "effect"

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
