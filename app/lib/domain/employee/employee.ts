import { Schema } from "effect"
import { Envelope } from "~/lib/domain/shared"

export const Employee = Schema.Struct({
  id: Schema.Number,
  name: Schema.optional(Schema.String),
})
export type Employee = Schema.Schema.Type<typeof Employee>

export const EmployeeResponse = Envelope(Employee)
export const EmployeeArrayResponse = Envelope(Schema.Array(Employee))
