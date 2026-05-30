import { Schema } from "effect";

export const EventId = Schema.Number.pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type
