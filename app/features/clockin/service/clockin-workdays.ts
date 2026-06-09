import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { ClockinProjectsApi, ClockinProjectsApiLive } from "../api";
import { ClockinCorrectionsApi, ClockinCorrectionsApiLive } from "../api";
import type { EventRead } from "~/lib/domain/event";
import { ProjectRef } from "~/lib/domain/project";
import {
  ProjectTotal,
  SliceId,
  Workday,
  WorkdaySegment,
  WorkdaySummary,
  WorkdayTotals
} from "~/lib/domain/workday";
import { TaskId, stateOfTask } from "./clockin-tasks";
import { formatDuration } from "./clockin-summary";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Per-day, LLM-friendly rollups derived from the raw correction-view payload
// (segments + totals per day). We read `/correction` (the same source the app's
// "Arbeitszeiten verwalten" screen uses) rather than `/workdays`, so older days
// are reachable. Raw transport lives in ClockinCorrectionsApi.

export interface ClockinWorkdaysService {
  /**
   * Per-day rollups (segments + totals) for the authenticated employee.
   *
   * Pass an ISO `date` ("YYYY-MM-DD") to keep only that day; omit it for the
   * full recent set. → 401 bad or missing token. Transport/decode failures are
   * defects.
   */
  readonly summaries: (
    date?: string
  ) => Effect.Effect<ReadonlyArray<WorkdaySummary>, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinWorkdays extends Context.Tag("ClockinWorkdays")<
  ClockinWorkdays,
  ClockinWorkdaysService
>() { }

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

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
        id: SliceId.make(start),
        type,
        project,
        startedAt: start,
        endedAt: next?.occured_at ?? null,
        durationSeconds,
        duration: formatDuration(durationSeconds),
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
      seconds: v.seconds,
      duration: formatDuration(v.seconds)
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
      clockedIn: formatDuration(clockedInSeconds),
      worked: formatDuration(workSeconds),
      onBreak: formatDuration(breakSeconds),
      perProject
    })
  });
};

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Reads correction-view workdays + projects through the API layer, then derives
// per-day rollups; project names resolve best-effort (a failed resolve degrades
// to a `Project {id}` placeholder). When `date` is given we filter to that day
// before deriving — the upstream has no date param, so this is a client slice.

export const ClockinWorkdaysLive = Layer.effect(
  ClockinWorkdays,
  Effect.gen(function* () {
    const correctionsApi = yield* ClockinCorrectionsApi;
    const projectsApi = yield* ClockinProjectsApi;

    return ClockinWorkdays.of({
      summaries: (date) =>
        Effect.gen(function* () {
          const all = yield* correctionsApi.workdays();
          const days = date != null ? all.filter((d) => d.date === date) : all;
          const allProjects = yield* projectsApi.list().pipe(Effect.catchAll(() => Effect.succeed([])));
          const projectNames = new Map(allProjects.map((p) => [p.id, p.name] as const));
          const projectName = (id: number) => projectNames.get(id) ?? `Project ${id}`;
          const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
          return days.map((d) => buildSummary(d, projectName, nowIso));
        })
    });
  })
).pipe(Layer.provide([ClockinCorrectionsApiLive, ClockinProjectsApiLive]));
