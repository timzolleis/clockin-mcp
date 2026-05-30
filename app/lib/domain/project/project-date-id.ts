import { Schema } from "effect";

export const ProjectDateId = Schema.Number.pipe(Schema.brand("ProjectDateId"))
export type ProjectDateId = typeof ProjectDateId.Type
