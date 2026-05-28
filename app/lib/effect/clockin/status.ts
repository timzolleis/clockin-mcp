import { Effect } from "effect"
import { ClockinProjects } from "./projects"
import { ClockinWorkdays } from "./workdays"
import {
  CurrentStatus,
  ProjectRef,
  type EventRead,
  type WorkState,
  type Workday,
} from "./schemas"
import { stateOfTask } from "./tasks"

const latestEvent = (days: readonly Workday[]): EventRead | null => {
  let best: EventRead | null = null
  for (const day of days) {
    for (const ev of day.events ?? []) {
      if (!best || ev.occured_at > best.occured_at) best = ev
    }
  }
  return best
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

const elapsedSeconds = (since: string, now: Date): number => {
  const t = new Date(since).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now.getTime() - t) / 1000))
}

const describe = (
  state: WorkState,
  project: ProjectRef | null,
  since: string | null,
  forSeconds: number,
): string => {
  const tail = since
    ? ` for ${formatDuration(forSeconds)} (since ${formatTime(since)})`
    : ""
  switch (state) {
    case "working":
      return `Working${tail}.`
    case "working_on_project":
      return project
        ? `Working on project "${project.name}"${tail}.`
        : `Working on a project${tail}.`
    case "on_break":
      return `On break${tail}.`
    case "driving":
      return `Driving${tail}.`
    case "loading":
      return `Loading${tail}.`
    case "business_trip":
      return `On a business trip${tail}.`
    case "special":
      return `Working on a special task${tail}.`
    case "clocked_out":
      return "Not currently clocked in."
    default:
      return "Status unknown."
  }
}

export class ClockinStatus extends Effect.Service<ClockinStatus>()(
  "ClockinStatus",
  {
    effect: Effect.gen(function* () {
      const workdays = yield* ClockinWorkdays
      const projects = yield* ClockinProjects

      const resolveProject = (id: number) =>
        projects.list().pipe(
          Effect.map((all) => {
            const p = all.find((x) => x.id === id)
            return p ? new ProjectRef({ id: p.id, name: p.name }) : null
          }),
          Effect.catchAll(() => Effect.succeed(null)),
        )

      const current = () =>
        Effect.gen(function* () {
          const days = yield* workdays.list()
          const ev = latestEvent(days)
          if (!ev) {
            return new CurrentStatus({
              state: "clocked_out",
              description: describe("clocked_out", null, null, 0),
              since: null,
              forSeconds: 0,
              project: null,
            })
          }
          const state = stateOfTask(ev.task_id)
          const project =
            state === "working_on_project" && ev.project_id != null
              ? yield* resolveProject(ev.project_id)
              : null
          const forSeconds = elapsedSeconds(ev.occured_at, new Date())
          return new CurrentStatus({
            state,
            description: describe(state, project, ev.occured_at, forSeconds),
            since: ev.occured_at,
            forSeconds,
            project,
          })
        })


      return { current }
    }),
    dependencies: [ClockinWorkdays.Default, ClockinProjects.Default],
  },
) {}
