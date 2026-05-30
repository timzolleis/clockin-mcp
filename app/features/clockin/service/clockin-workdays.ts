import { HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "./clockin-api-errors";
import { DeviceClockinClient, onlyClockinErrors } from "./clockin-client";
import type { CurrentClockinCredentials } from "./clockin-client";
import type { EventRead } from "~/lib/domain/event";
import { ProjectArrayResponse, ProjectRef } from "~/lib/domain/project";
import {
  ProjectTotal,
  Workday,
  WorkdayArrayResponse,
  WorkdaySegment,
  WorkdaySummary,
  WorkdayTotals
} from "~/lib/domain/workday";
import type { EmployeeId } from "~/lib/domain/employee";
import { TaskId, stateOfTask } from "./clockin-tasks";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinWorkdaysService {
  /**
   * List the raw workdays (with nested events) for an employee.
   *
   * `GET /workdays?employee_id={id}` (device_token) → 401 bad or missing token.
   * When `employeeId` is omitted the impl falls back to the `employee_id` in the
   * current credentials. Transport/decode failures are defects, not part of this
   * channel.
   */
  readonly list: (
    employeeId?: EmployeeId
  ) => Effect.Effect<ReadonlyArray<Workday>, ClockinUnauthenticatedError, CurrentClockinCredentials>;

  /**
   * Per-day, LLM-friendly rollups derived from the same `GET /workdays` payload
   * (segments + totals per day).
   *
   * `GET /workdays?employee_id={id}` (device_token) → 401 bad or missing token.
   * When `employeeId` is omitted the impl falls back to the `employee_id` in the
   * current credentials. Transport/decode failures are defects, not part of this
   * channel.
   */
  readonly summaries: (
    employeeId?: EmployeeId
  ) => Effect.Effect<ReadonlyArray<WorkdaySummary>, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinWorkdays extends Context.Tag("ClockinWorkdays")<
  ClockinWorkdays,
  ClockinWorkdaysService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Both ops ride the DeviceClockinClient (device_token bearer). `summaries`
// derives per-day rollups from the same `/workdays` payload, resolving project
// names via a best-effort `/projects` fetch on the same client.

const sortedEvents = (day: Workday): readonly EventRead[] =>
  [...(day.events ?? [])].sort((a, b) => a.occured_at.localeCompare(b.occured_at));

const secondsBetween = (start: string, end: string): number => {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
};

const buildSummary = (
  day: Workday,
  projectName: (id: number) => string,
  nowIso: string
): WorkdaySummary => {
  const events = sortedEvents(day);
  const segments: WorkdaySegment[] = [];
  let startedAt: string | null = null;
  let endedAt: string | null = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const next = events[i + 1];
    const start = ev.occured_at;

    if (ev.task_id === TaskId.CLOCKOUT) {
      endedAt = start;
      continue;
    }

    if (!startedAt) startedAt = start;

    const closeAt = next?.occured_at ?? nowIso;
    const ongoing = !next;
    const durationSeconds = secondsBetween(start, closeAt);
    const type = stateOfTask(ev.task_id);
    const project =
      ev.project_id != null
        ? new ProjectRef({
            id: ev.project_id,
            name: projectName(ev.project_id)
          })
        : null;

    segments.push(
      WorkdaySegment.make({
        type,
        project,
        startedAt: start,
        endedAt: next?.occured_at ?? null,
        durationSeconds,
        ongoing
      })
    );
  }

  const sumWhere = (pred: (s: WorkdaySegment) => boolean) =>
    segments.reduce((n, s) => (pred(s) ? n + s.durationSeconds : n), 0);

  const clockedInSeconds = sumWhere((s) => s.type !== "on_break");
  const workSeconds = sumWhere((s) => s.type === "working" || s.type === "working_on_project");
  const breakSeconds = sumWhere((s) => s.type === "on_break");

  const projectMap = new Map<number, { name: string; seconds: number }>();
  for (const s of segments) {
    if (!s.project) continue;
    const prev = projectMap.get(s.project.id);
    if (prev) {
      prev.seconds += s.durationSeconds;
    } else {
      projectMap.set(s.project.id, {
        name: s.project.name,
        seconds: s.durationSeconds
      });
    }
  }
  const perProject = Array.from(projectMap, ([id, v]) =>
    ProjectTotal.make({
      projectId: id,
      projectName: v.name,
      seconds: v.seconds
    })
  );

  return WorkdaySummary.make({
    date: day.date ?? null,
    startedAt,
    endedAt,
    ongoing: startedAt != null && endedAt == null,
    segments,
    totals: WorkdayTotals.make({
      clockedInSeconds,
      workSeconds,
      breakSeconds,
      perProject
    })
  });
};

export const ClockinWorkdaysLive = Layer.effect(
  ClockinWorkdays,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    const readWorkdays = (employeeId?: EmployeeId) =>
      device
        .get(employeeId != null ? `/workdays?employee_id=${employeeId}` : "/workdays")
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkdayArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        );

    return ClockinWorkdays.of({
      list: (employeeId) => readWorkdays(employeeId),

      summaries: (employeeId) =>
        Effect.gen(function* () {
          const days = yield* readWorkdays(employeeId);
          const allProjects = yield* device.get("/projects").pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectArrayResponse)),
            Effect.map((r) => r.data),
            Effect.scoped,
            Effect.catchAll(() => Effect.succeed([]))
          );
          const projectNames = new Map(allProjects.map((p) => [p.id, p.name] as const));
          const projectName = (id: number) => projectNames.get(id) ?? `Project ${id}`;
          const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
          return days.map((d) => buildSummary(d, projectName, nowIso));
        })
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
