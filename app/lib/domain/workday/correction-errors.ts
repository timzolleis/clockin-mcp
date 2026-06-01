import { Schema } from "effect"

// A plan the upstream could never satisfy — empty, non-positive durations,
// mixed modes, or a PROJECT slice with no project. User-facing (the agent can
// fix its own input), so it rides the typed error channel, never a defect.
export class InvalidCorrectionPlanError extends Schema.TaggedError<InvalidCorrectionPlanError>()(
  "InvalidCorrectionPlanError",
  { reason: Schema.String },
) {}

// `editSlice` targeted a slice id that isn't present in the resolved day.
export class SliceNotFoundError extends Schema.TaggedError<SliceNotFoundError>()(
  "SliceNotFoundError",
  { sliceId: Schema.String },
) {}
