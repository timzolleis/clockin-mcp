import { HttpBody, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError, ClockinValidationError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { DeviceClockinClient, onlyClockinErrors } from "../client";
import type { Project, ProjectDateId, ProjectId } from "~/lib/domain/project";
import { ProjectArrayResponse, ProjectResponse } from "~/lib/domain/project";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Pure transport over the upstream `/projects` resource (device_token). Free-text
// search (a client-side filter over `list`) is business logic and lives in the
// ClockinProjects service.

export interface ClockinProjectsApiService {
  /**
   * List every project visible to the current device.
   *
   * `GET /projects` (device_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly list: () => Effect.Effect<
    ReadonlyArray<Project>,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * Fetch a single project by id.
   *
   * `GET /projects/{projectId}` (device_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly get: (
    projectId: ProjectId
  ) => Effect.Effect<Project, ClockinUnauthenticatedError, CurrentClockinCredentials>;

  /**
   * Mark a project as completed.
   *
   * `POST /projects/complete/{projectId}` (device_token) → 401, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly complete: (
    projectId: ProjectId
  ) => Effect.Effect<void, ClockinUnauthenticatedError | ClockinValidationError, CurrentClockinCredentials>;

  /**
   * Mark a single project date as completed.
   *
   * `POST /projectDates/complete/{projectDateId}` (device_token) → 401, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly completeDate: (
    projectDateId: ProjectDateId
  ) => Effect.Effect<void, ClockinUnauthenticatedError | ClockinValidationError, CurrentClockinCredentials>;
}

export class ClockinProjectsApi extends Context.Tag("ClockinProjectsApi")<
  ClockinProjectsApi,
  ClockinProjectsApiService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Rides DeviceClockinClient (device_token). `onlyClockinErrors` keeps each op's
// documented statuses and turns every other failure into a defect.

export const ClockinProjectsApiLive = Layer.effect(
  ClockinProjectsApi,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    return ClockinProjectsApi.of({
      list: () =>
        device.get("/projects").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      get: (projectId) =>
        device.get(`/projects/${projectId}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      complete: (projectId) =>
        device.post(`/projects/complete/${projectId}`, { body: HttpBody.unsafeJson({}) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        ),

      completeDate: (projectDateId) =>
        device.post(`/projectDates/complete/${projectDateId}`, { body: HttpBody.unsafeJson({}) }).pipe(
          Effect.asVoid,
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
