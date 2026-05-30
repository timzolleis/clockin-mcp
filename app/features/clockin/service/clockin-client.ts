import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Redacted, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import { ClockinConfig } from "~/lib/config/clockin-config";
import { ClockinCredentials } from "~/lib/domain/credentials";
import type { ClockinApiError } from "./clockin-api-errors";
import {
  ClockinBadRequestError,
  ClockinConflictError,
  ClockinForbiddenError,
  ClockinGoneError,
  ClockinNotFoundError,
  ClockinRateLimitError,
  ClockinUnauthenticatedError,
  ClockinUnknownError,
  ClockinValidationError
} from "./clockin-api-errors";

/**
 * Everything a client call can fail with: a status-mapped upstream error, a
 * transport failure (RequestError), or a response that didn't match its schema
 * (ParseError). Service interfaces use this as their error channel.
 */
export type ClockinClientError = ClockinApiError | HttpClientError.RequestError | ParseError;

/**
 * Narrow a client call down to exactly the upstream errors a given operation
 * documents. Anything else — an undocumented status, a transport `RequestError`,
 * or a decode `ParseError` — becomes a defect, since the public service API only
 * promises the documented channel.
 *
 *   callProjects(device).pipe(onlyClockinErrors("ClockinUnauthenticatedError"))
 */
export const onlyClockinErrors =
  <const Tags extends ReadonlyArray<ClockinApiError["_tag"]>>(...tags: Tags) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, Extract<E, { readonly _tag: Tags[number] }>, R> => {
    const keep = new Set<string>(tags);
    return Effect.catchAll(effect, (error) =>
      typeof error === "object" && error !== null && "_tag" in error && keep.has((error as { _tag: string })._tag)
        ? Effect.fail(error as Extract<E, { readonly _tag: Tags[number] }>)
        : Effect.die(error)
    );
  };

// Upstream is a Laravel API: every error response carries `message`, and 422s
// additionally carry a per-field `errors` map.
const ClockinErrorBody = Schema.Struct({
  message: Schema.String,
  errors: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }))
});

const mapResponseError = Effect.fnUntraced(function* (error: HttpClientError.ResponseError) {
  const status = error.response.status;
  // Decode the body for `message`/`errors`; fall back to the transport message
  // if the body is absent or not the expected shape.
  const body = yield* HttpClientResponse.schemaBodyJson(ClockinErrorBody)(error.response).pipe(
    Effect.orElseSucceed((): Schema.Schema.Type<typeof ClockinErrorBody> => ({ message: error.message }))
  );
  const message = body.message;

  switch (status) {
    case 400:
      return yield* new ClockinBadRequestError({ message, cause: error });
    case 401:
      return yield* new ClockinUnauthenticatedError({ message, cause: error });
    case 403:
      return yield* new ClockinForbiddenError({ message, cause: error });
    case 404:
      return yield* new ClockinNotFoundError({ message, cause: error });
    case 409:
      return yield* new ClockinConflictError({ message, cause: error });
    case 410:
      return yield* new ClockinGoneError({ message, cause: error });
    case 422:
      return yield* new ClockinValidationError({ message, details: body.errors, cause: error });
    case 429:
      return yield* new ClockinRateLimitError({ message, cause: error });
    default:
      // Unmapped status (incl. 5xx) — surface as an unknown error with the raw cause.
      return yield* new ClockinUnknownError({ message, status, cause: error });
  }
});

const DEVICE_INFO = JSON.stringify({
  app_build: "0",
  app_version: "0.1.0",
  device_model: "mcp",
  operating_system: "mcp",
  os_version: "1"
});

//base client used for all requests to clockin. Can be extend by an AuthenticatedClockinClient
export class ClockinHttpClient extends Effect.Service<ClockinHttpClient>()("ClockinHttpClient", {
  effect: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const { baseUrl } = yield* ClockinConfig

    const withDefaults = client.pipe(
      HttpClient.mapRequest(request => request.pipe(
        // Operations issue relative paths (e.g. "/projects"); the base URL is
        // prepended here so every call hits the configured Clockin host.
        HttpClientRequest.prependUrl(baseUrl),
        HttpClientRequest.acceptJson,
        // Mirrors the mobile app — required upstream on every request, even the
        // unauthenticated ones (login). The bearer token is layered on top by
        // the authenticated clients below.
        HttpClientRequest.setHeader("device-information", DEVICE_INFO)
      )),
      HttpClient.filterStatusOk
    )

    // data-first form so `E` is inferred from `withDefaults` (HttpClientError);
    // ResponseError is mapped, RequestError (transport) stays in the channel.
    return HttpClient.catchTag(withDefaults, "ResponseError", mapResponseError)
  }),
  dependencies: [FetchHttpClient.layer, ClockinConfig.layer]
}) { }

// The decrypted credentials for the current request. Provided per-request by the
// handler (one user's tokens), read lazily by the authenticated clients below —
// NOT baked in at layer-build time.
export class CurrentClockinCredentials extends Context.Tag("CurrentClockinCredentials")<
  CurrentClockinCredentials,
  ClockinCredentials
>() { }

// Decorate the base client with a bearer token picked from the current
// credentials. No path routing: the caller chooses the token tier by choosing
// which client to depend on. (The device-information header is already set on
// the base client.)
const authenticatedClient = (pickToken: (creds: ClockinCredentials) => Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const base = yield* ClockinHttpClient;
    return HttpClient.mapRequestEffect(base, (request) =>
      Effect.map(CurrentClockinCredentials, (creds) =>
        request.pipe(
          HttpClientRequest.bearerToken(Redacted.value(pickToken(creds)))
        )
      )
    );
  });

// Sends `Authorization: Bearer <user_token>` — for /correction, /timesheet,
// /absence, /shift-plan, /admin/*, logout, ...
export class UserClockinClient extends Effect.Service<UserClockinClient>()("UserClockinClient", {
  effect: authenticatedClient((creds) => creds.userToken),
  dependencies: [ClockinHttpClient.Default]
}) { }

// Sends `Authorization: Bearer <device_token>` — for /events, /projects,
// /workdays, /device/*, /notifications, ...
export class DeviceClockinClient extends Effect.Service<DeviceClockinClient>()("DeviceClockinClient", {
  effect: authenticatedClient((creds) => creds.deviceToken),
  dependencies: [ClockinHttpClient.Default]
}) { }

