import { HttpApiSchema } from "@effect/platform"
import { Effect, Schema } from "effect"



export class NotConfiguredError extends Schema.TaggedError<NotConfiguredError>()(
  "NotConfiguredError",
  { message: Schema.String },
  HttpApiSchema.annotations({
    status: 409,
    description: "Clockin credentials not configured for this user.",
  }),
) {}

export class UpstreamError extends Schema.TaggedError<UpstreamError>()(
  "UpstreamError",
  { message: Schema.String },
  HttpApiSchema.annotations({
    status: 502,
    description: "Clockin upstream call failed.",
  }),
) {}

export class ServerError extends Schema.TaggedError<ServerError>()(
  "ServerError",
  {
    message: Schema.String,
    details: Schema.NullOr(Schema.String),
  },
  HttpApiSchema.annotations({
    status: 500,
    description: "An unexpected server error occurred.",
  }),
) {}

/**
 * Wrap a handler effect so that:
 *  - any defect (uncaught throw, missing dep, etc.) becomes a ServerError 500
 *  - the full Cause is logged server-side via Effect.logError
 *
 * Without this, unexpected throws turn into opaque 500s with no log trail.
 */
export const mapServerError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, ServerError | E, R> =>
  effect.pipe(
    Effect.tapErrorCause(Effect.logError),
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new ServerError({
          message: "An unexpected error occurred",
          details: cause instanceof Error ? cause.message : String(cause),
        }),
      ),
    ),
  )
