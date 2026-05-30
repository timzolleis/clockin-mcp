import { Schema } from "effect";

export const EmployeeId = Schema.Number.pipe(Schema.brand("EmployeeId"))
export type EmployeeId = typeof EmployeeId.Type