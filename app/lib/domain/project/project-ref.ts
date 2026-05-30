import { Schema } from "effect"

/** A resolved project reference (id + name) used in derived status/summaries. */
export class ProjectRef extends Schema.Class<ProjectRef>("ProjectRef")({
  id: Schema.Number,
  name: Schema.String,
}) {}
