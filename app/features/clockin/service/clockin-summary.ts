import type { WorkdaySummary } from "~/lib/domain/workday";

// ---------------------------------------------------------------------------
// Pure shaping for action-tool responses
// ---------------------------------------------------------------------------
// The event tools (clock in/out, break, resume, project) post a single event
// and otherwise return nothing useful. To let an agent reply with a nice
// human sentence ("7h 48m logged today across 2 projects") we read today's
// workday back and fold it into a compact, self-describing payload: every
// duration carries both raw `*Seconds` (for math) and a formatted label (for
// display). Timestamps stay ISO so the agent can localize them — we never bake
// a wall-clock time into a string here (the server runs in UTC).

/** Humanize a second count: `0s`, `48m`, `7h`, `7h 48m`. Never negative. */
export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export interface ProjectShare {
  id: number;
  name: string;
  seconds: number;
  /** `formatDuration(seconds)`. */
  duration: string;
}

/** One day's totals, formatted for direct use in an assistant reply. */
export interface DaySummary {
  date: string | null;
  /** ISO timestamp the day opened. */
  startedAt: string | null;
  /** ISO timestamp the day closed, or null while ongoing. */
  endedAt: string | null;
  ongoing: boolean;
  worked: string;
  workedSeconds: number;
  onBreak: string;
  breakSeconds: number;
  clockedIn: string;
  clockedInSeconds: number;
  projects: ProjectShare[];
  projectCount: number;
}

/**
 * Pick the workday we just acted in — the one with the most recent activity.
 * `summaries()` is not guaranteed sorted, so compare defensively on the day's
 * start (falling back to its date) rather than trusting array order.
 */
export const currentDay = (
  summaries: ReadonlyArray<WorkdaySummary>,
): WorkdaySummary | null => {
  let best: WorkdaySummary | null = null;
  let bestKey = "";
  for (const day of summaries) {
    const key = day.startedAt ?? day.date ?? "";
    if (best === null || key > bestKey) {
      best = day;
      bestKey = key;
    }
  }
  return best;
};

/** Fold a raw {@link WorkdaySummary} into the display-ready {@link DaySummary}. */
export const summarizeDay = (
  day: WorkdaySummary | null,
): DaySummary | null => {
  if (!day) return null;
  const t = day.totals;
  return {
    date: day.date,
    startedAt: day.startedAt,
    endedAt: day.endedAt,
    ongoing: day.ongoing,
    worked: formatDuration(t.workSeconds),
    workedSeconds: t.workSeconds,
    onBreak: formatDuration(t.breakSeconds),
    breakSeconds: t.breakSeconds,
    clockedIn: formatDuration(t.clockedInSeconds),
    clockedInSeconds: t.clockedInSeconds,
    projects: t.perProject.map((p) => ({
      id: p.projectId,
      name: p.projectName,
      seconds: p.seconds,
      duration: formatDuration(p.seconds),
    })),
    projectCount: t.perProject.length,
  };
};

/** `1 project` / `3 projects`, or `""` when there were none. */
export const projectsPhrase = (count: number): string =>
  count <= 0 ? "" : ` across ${count} project${count === 1 ? "" : "s"}`;
