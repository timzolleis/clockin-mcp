import { Schema } from "effect"
import { AnyTaskId } from "~/lib/domain/task"
import { Envelope } from "~/lib/domain/shared"

export const TaskConfig = Schema.Struct({
  task_id: AnyTaskId,
})

export const TaskConfigsResponse = Envelope(Schema.Array(TaskConfig))
