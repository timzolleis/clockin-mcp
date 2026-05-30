import { Schema } from "effect";

export const ProjectId = Schema.Number.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type