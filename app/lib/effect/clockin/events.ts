import { Effect } from "effect"
import { ClockinApiClient, ClockinTokens } from "./client"
import {
  ClockableTaskId,
  EventInput,
  EventInputArray,
  StoreEventsResponse,
} from "./schemas"
import { CLOCKABLE_TASK_IDS, TaskId } from "./tasks"

type EventDraft = {
  taskId: ClockableTaskId
  projectId?: number | null
  projectDateId?: number | null
  occurredAt?: Date
}

const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")

export class ClockinEvents extends Effect.Service<ClockinEvents>()(
  "ClockinEvents",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient

      const build = (
        draft: EventDraft,
        employeeId: number,
      ): EventInput => ({
        id: null,
        uuid: crypto.randomUUID(),
        occured_at: isoNoMs(draft.occurredAt ?? new Date()),
        task_id: draft.taskId,
        project_id: draft.projectId ?? null,
        // Only include project_date_id when explicitly set — matches mobile.
        ...(draft.projectDateId != null
          ? { project_date_id: draft.projectDateId }
          : {}),
        task_label: "",
        employee_id: employeeId,
        is_workplan_event: null,
        site_id: null,
      })

      const send = (draft: EventDraft) =>
        Effect.flatMap(ClockinTokens, (t) => {
          const body = api.encodeBody(EventInputArray, [
            build(draft, t.employeeId),
          ])
          return api.post("/events/storeMany", body, StoreEventsResponse)
        })

      return {
        clockIn: () => send({ taskId: TaskId.WORK }),
        clockOut: () => send({ taskId: TaskId.CLOCKOUT }),
        startBreak: () => send({ taskId: TaskId.BREAK }),
        resumeWork: () => send({ taskId: TaskId.WORK }),
        startProject: (projectId: number, projectDateId?: number) =>
          send({
            taskId: TaskId.PROJECT,
            projectId,
            projectDateId: projectDateId ?? null,
          }),
        switchTask: (taskId: number, projectId?: number) => {
          if (!CLOCKABLE_TASK_IDS.has(taskId)) {
            return Effect.fail(
              new Error(`task_id ${taskId} is not a clockable task`),
            )
          }
          if (taskId === TaskId.PROJECT && projectId == null) {
            return Effect.fail(
              new Error("PROJECT task requires a project_id"),
            )
          }
          return send({
            taskId: taskId as ClockableTaskId,
            projectId: projectId ?? null,
          })
        },
      }
    }),
    dependencies: [ClockinApiClient.Default],
  },
) {}
