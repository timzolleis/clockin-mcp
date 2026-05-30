import { HttpBody, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";
import type {
  ClockinRateLimitError,
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "./clockin-api-errors";
import type { CurrentClockinCredentials } from "./clockin-client";
import { ClockinHttpClient, UserClockinClient, onlyClockinErrors } from "./clockin-client";

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

/** Email + password exchanged for tokens at `POST /auth/user/login`. */
export class LoginInput extends Schema.Class<LoginInput>("LoginInput")({
  email: Schema.String,
  password: Schema.String
}) { }

/**
 * Result of a personal-account login. Snake_case upstream fields are mapped to
 * camelCase, and tokens are wrapped in `Redacted` so they stay out of logs/spans.
 */
export class PersonalLogin extends Schema.Class<PersonalLogin>("PersonalLogin")({
  authToken: Schema.Redacted(Schema.String).pipe(Schema.propertySignature, Schema.fromKey("auth_token")),
  userToken: Schema.Redacted(Schema.String).pipe(Schema.propertySignature, Schema.fromKey("user_token")),
  deviceToken: Schema.Redacted(Schema.String).pipe(Schema.propertySignature, Schema.fromKey("device_token")),
  type: Schema.Literal("personal")
}) { }

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinAuthService {
  /**
   * Exchange email + password for the upstream tokens. Unauthenticated — runs
   * on the base client, so no `CurrentClockinCredentials` is required.
   *
   * `POST /auth/user/login` → 401 bad credentials, 422 validation, 429 rate limit.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly login: (
    input: LoginInput
  ) => Effect.Effect<PersonalLogin, ClockinUnauthenticatedError | ClockinValidationError | ClockinRateLimitError>;

  /**
   * Invalidate the current user session (`POST /auth/user/logout`, user_token).
   * Reads the per-request credentials from context.
   *
   * `POST /auth/user/logout` → 401 only.
   */
  readonly logout: () => Effect.Effect<void, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinAuth extends Context.Tag("ClockinAuth")<
  ClockinAuth,
  ClockinAuthService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Login rides the base ClockinHttpClient (unauthenticated). Logout rides the
// UserClockinClient (user_token), reading the per-request credentials from
// context. `onlyClockinErrors` keeps each op's documented statuses and turns
// every other failure — undocumented status, transport, decode — into a defect.

/** `POST /auth/user/login` returns the tokens wrapped in the usual `{ data }` envelope. */
const LoginResponse = Schema.Struct({ data: PersonalLogin });

export const ClockinAuthLive = Layer.effect(
  ClockinAuth,
  Effect.gen(function* () {
    const base = yield* ClockinHttpClient;
    const user = yield* UserClockinClient;

    return ClockinAuth.of({
      login: (input) =>
        base.post("/auth/user/login", {
          body: HttpBody.unsafeJson({ email: input.email, password: input.password })
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(LoginResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors(
            "ClockinUnauthenticatedError",
            "ClockinValidationError",
            "ClockinRateLimitError"
          )
        ),

      logout: () =>
        user.post("/auth/user/logout", { body: HttpBody.unsafeJson({}) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        )
    });
  })
).pipe(Layer.provide([ClockinHttpClient.Default, UserClockinClient.Default]));
