import { Schema } from "effect"
import { ProjectRef } from "~/lib/domain/project"
import { WorkState } from "~/lib/domain/task"
import { SliceId } from "./slice-id"

// LLM-friendly per-day rollups derived from a /workdays payload.

export class WorkdaySegment extends Schema.Class<WorkdaySegment>(
  "WorkdaySegment",
)({
  // Opaque handle (opening event's occured_at) so a correction can target this
  // exact slice — e.g. which of two "elternportal" segments to resize.
  id: SliceId,
  type: WorkState,
  project: Schema.NullOr(ProjectRef),
  startedAt: Schema.String,
  endedAt: Schema.NullOr(Schema.String),
  durationSeconds: Schema.Number,
  // `formatDuration(durationSeconds)` — speak-ready, no math needed.
  duration: Schema.String,
  ongoing: Schema.Boolean,
}) {}

export class ProjectTotal extends Schema.Class<ProjectTotal>("ProjectTotal")({
  projectId: Schema.Number,
  projectName: Schema.String,
  seconds: Schema.Number,
  // `formatDuration(seconds)`.
  duration: Schema.String,
}) {}

export class WorkdayTotals extends Schema.Class<WorkdayTotals>(
  "WorkdayTotals",
)({
  clockedInSeconds: Schema.Number,
  workSeconds: Schema.Number,
  breakSeconds: Schema.Number,
  // Formatted siblings of the `*Seconds` above — agent can echo these directly.
  clockedIn: Schema.String,
  worked: Schema.String,
  onBreak: Schema.String,
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
