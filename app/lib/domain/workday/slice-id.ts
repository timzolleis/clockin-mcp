import { Schema } from "effect"

// Opaque handle to a workday segment = its opening event's `occured_at`. Stable
// within a single read (the same physical event keys both /workdays and
// /correction), but invalidated by any correction — wipe-and-replace recreates
// every event, so callers must re-read to get fresh ids after a write.
export const SliceId = Schema.String.pipe(Schema.brand("SliceId"))
export type SliceId = typeof SliceId.Type
