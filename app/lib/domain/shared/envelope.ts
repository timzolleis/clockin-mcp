import { Schema } from "effect"

// The Clockin API consistently wraps responses in `{ data: ... }`.
export const Envelope = <A, I, R>(inner: Schema.Schema<A, I, R>) =>
  Schema.Struct({ data: inner })
