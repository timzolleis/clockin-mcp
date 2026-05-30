import { Schema } from "effect"
import { ProjectRef } from "~/lib/domain/project"
import { WorkState } from "~/lib/domain/task"

// Status is derived client-side; there is no upstream status endpoint.
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
