import { Schema } from "effect";

/** 400 — malformed request, device not personal, feature disabled for company. */
export class ClockinBadRequestError extends Schema.TaggedError<ClockinBadRequestError>()("ClockinBadRequestError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 401 — bad or missing token. Refresh the credential. */
export class ClockinUnauthenticatedError extends Schema.TaggedError<ClockinUnauthenticatedError>()("ClockinUnauthenticatedError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 403 — wrong token tier (device_token vs user_token) or insufficient permission. */
export class ClockinForbiddenError extends Schema.TaggedError<ClockinForbiddenError>()("ClockinForbiddenError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 404 — resource (project recording, token, ...) not found or already completed. */
export class ClockinNotFoundError extends Schema.TaggedError<ClockinNotFoundError>()("ClockinNotFoundError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 409 — conflict: resource modified by a newer version, token already authorized, upload already completed. */
export class ClockinConflictError extends Schema.TaggedError<ClockinConflictError>()("ClockinConflictError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 410 — gone: code or token expired. */
export class ClockinGoneError extends Schema.TaggedError<ClockinGoneError>()("ClockinGoneError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** 422 — request validation failed. `details` carries the per-field error map when present. */
export class ClockinValidationError extends Schema.TaggedError<ClockinValidationError>()("ClockinValidationError", {
  message: Schema.String,
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) })),
  cause: Schema.Defect
}) { }

/** 429 — too many requests (rate limited). */
export class ClockinRateLimitError extends Schema.TaggedError<ClockinRateLimitError>()("ClockinRateLimitError", {
  message: Schema.String,
  cause: Schema.Defect
}) { }

/** Any unmapped status (incl. 5xx) — carries the original status for diagnostics. */
export class ClockinUnknownError extends Schema.TaggedError<ClockinUnknownError>()("ClockinUnknownError", {
  message: Schema.String,
  status: Schema.Number,
  cause: Schema.Defect
}) { }

/** Every status-mapped error the clients can raise. */
export type ClockinApiError =
  | ClockinBadRequestError
  | ClockinUnauthenticatedError
  | ClockinForbiddenError
  | ClockinNotFoundError
  | ClockinConflictError
  | ClockinGoneError
  | ClockinValidationError
  | ClockinRateLimitError
  | ClockinUnknownError;
