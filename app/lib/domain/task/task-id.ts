import { Schema } from "effect"

export const ClockableTaskId = Schema.Literal(2, 3, 4, 5, 6, 7, 8, 9, 10)
export type ClockableTaskId = Schema.Schema.Type<typeof ClockableTaskId>

// Reads may include server-only sentinels (11–13); accept any number.
export const AnyTaskId = Schema.Number
