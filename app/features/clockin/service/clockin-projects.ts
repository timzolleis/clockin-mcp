import { HttpBody, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type {
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "./clockin-api-errors";
import type { CurrentClockinCredentials } from "./clockin-client";
import { DeviceClockinClient, onlyClockinErrors } from "./clockin-client";
import type { Project } from "~/lib/domain/project";
import { ProjectArrayResponse, ProjectResponse } from "~/lib/domain/project";
import type { ProjectDateId, ProjectId } from "~/lib/domain/project";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinProjectsService {
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
   * Search projects by free-text query.
   *
   * `POST /projects/search` (device_token) → 401 bad/missing token, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly search: (
    query: string
  ) => Effect.Effect<
    ReadonlyArray<Project>,
    ClockinUnauthenticatedError | ClockinValidationError,
    CurrentClockinCredentials
  >;

  /**
   * Mark a project as completed.
   *
   * `POST /projects/complete/{projectId}` (device_token) → 401 bad/missing token, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly complete: (
    projectId: ProjectId
  ) => Effect.Effect<
    void,
    ClockinUnauthenticatedError | ClockinValidationError,
    CurrentClockinCredentials
  >;

  /**
   * Mark a single project date as completed.
   *
   * `POST /projectDates/complete/{projectDateId}` (device_token) → 401 bad/missing token, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly completeDate: (
    projectDateId: ProjectDateId
  ) => Effect.Effect<
    void,
    ClockinUnauthenticatedError | ClockinValidationError,
    CurrentClockinCredentials
  >;
}

export class ClockinProjects extends Context.Tag("ClockinProjects")<
  ClockinProjects,
  ClockinProjectsService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Every op rides the DeviceClockinClient (device_token), reading the per-request
// credentials from `CurrentClockinCredentials`. `search` filters the project
// list client-side — the upstream `/projects/search` has been observed to hang.
// `onlyClockinErrors` keeps each op's documented statuses and turns every other
// failure (undocumented status, transport, decode) into a defect.

export const ClockinProjectsLive = Layer.effect(
  ClockinProjects,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    const list = () =>
      device.get("/projects").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectArrayResponse)),
        Effect.map((r) => r.data),
        onlyClockinErrors("ClockinUnauthenticatedError")
      );

    return ClockinProjects.of({
      list,

      get: (projectId) =>
        device.get(`/projects/${projectId}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ProjectResponse)),
          Effect.map((r) => r.data),
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      // POST /projects/search has been observed to hang upstream. The project
      // list is bounded, so we fetch all and filter locally.
      search: (query) =>
        list().pipe(
          Effect.map((all) => {
            const q = query.trim().toLowerCase();
            if (!q) return all;
            return all.filter((p) => p.name.toLowerCase().includes(q));
          })
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
