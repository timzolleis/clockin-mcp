import { Schema } from "effect"
import { ProjectRef } from "~/lib/domain/project"
import { WorkState } from "~/lib/domain/task"

// LLM-friendly per-day rollups derived from a /workdays payload.

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
