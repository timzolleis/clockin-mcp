import { Context, Effect, Layer } from "effect";
import type { ClockinUnauthenticatedError } from "../client";
import type { CurrentClockinCredentials } from "../client";
import { ClockinProjectsApi, ClockinProjectsApiLive } from "../api";
import type { Project } from "~/lib/domain/project";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------
// Project reads with a touch of business logic: free-text `search` is a
// client-side filter over the full list (the upstream `/projects/search` has
// been observed to hang). Raw transport lives in ClockinProjectsApi.

export interface ClockinProjectsService {
  /**
   * List every project visible to the current device.
   *
   * `GET /projects` (device_token) → 401 bad/missing token.
   */
  readonly list: () => Effect.Effect<
    ReadonlyArray<Project>,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * Filter projects by a case-insensitive substring of their name. Fetches the
   * full list and filters locally.
   *
   * `GET /projects` (device_token) → 401 bad/missing token.
   */
  readonly search: (
    query: string
  ) => Effect.Effect<ReadonlyArray<Project>, ClockinUnauthenticatedError, CurrentClockinCredentials>;
}

export class ClockinProjects extends Context.Tag("ClockinProjects")<
  ClockinProjects,
  ClockinProjectsService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const ClockinProjectsLive = Layer.effect(
  ClockinProjects,
  Effect.gen(function* () {
    const api = yield* ClockinProjectsApi;

    return ClockinProjects.of({
      list: () => api.list(),

      // POST /projects/search has been observed to hang upstream. The project
      // list is bounded, so we fetch all and filter locally.
      search: (query) =>
        api.list().pipe(
          Effect.map((all) => {
            const q = query.trim().toLowerCase();
            if (!q) return all;
            return all.filter((p) => p.name.toLowerCase().includes(q));
          })
        )
    });
  })
).pipe(Layer.provide([ClockinProjectsApiLive]));
