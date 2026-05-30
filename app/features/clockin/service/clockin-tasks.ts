import type { ClockableTaskId, WorkState } from "~/lib/domain/task";

/** Task IDs the Clockin upstream understands, by intent. */
export const TaskId = {
  WORK: 10,
  CLOCKOUT: 8,
  BREAK: 5,
  PROJECT: 4,
  DRIVE: 3,
  LOAD: 2,
  DUTY: 9,
  SPECIAL1: 6,
  SPECIAL2: 7,
} as const satisfies Record<string, ClockableTaskId>;

export const CLOCKABLE_TASK_IDS: ReadonlySet<number> = new Set([
  TaskId.WORK,
  TaskId.BREAK,
  TaskId.PROJECT,
  TaskId.DRIVE,
  TaskId.LOAD,
  TaskId.DUTY,
  TaskId.SPECIAL1,
  TaskId.SPECIAL2,
  TaskId.CLOCKOUT,
]);

export const stateOfTask = (taskId: number | null | undefined): WorkState => {
  switch (taskId) {
    case TaskId.WORK:
      return "working";
    case TaskId.CLOCKOUT:
      return "clocked_out";
    case TaskId.BREAK:
      return "on_break";
    case TaskId.PROJECT:
      return "working_on_project";
    case TaskId.DRIVE:
      return "driving";
    case TaskId.LOAD:
      return "loading";
    case TaskId.DUTY:
      return "business_trip";
    case TaskId.SPECIAL1:
    case TaskId.SPECIAL2:
      return "special";
    default:
      return "unknown";
  }
};
