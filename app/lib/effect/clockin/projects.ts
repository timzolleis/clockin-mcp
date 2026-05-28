import { Effect } from "effect"
import { ClockinApiClient } from "./client"
import {
  ProjectArrayResponse,
  ProjectResponse,
  StoreEventsResponse,
} from "./schemas"

export class ClockinProjects extends Effect.Service<ClockinProjects>()(
  "ClockinProjects",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient

      const list = () =>
        api
          .get("/projects", ProjectArrayResponse)
          .pipe(Effect.map((r) => r.data))

      // POST /projects/search has been observed to hang. The project list is
      // bounded, so we fetch all and filter locally — fast and avoids the
      // unstable upstream search.
      const search = (query: string) =>
        list().pipe(
          Effect.map((all) => {
            const q = query.trim().toLowerCase()
            if (!q) return all
            return all.filter((p) => p.name.toLowerCase().includes(q))
          }),
        )

      return {
        list,
        search,
        get: (id: number) =>
          api
            .get(`/projects/${id}`, ProjectResponse)
            .pipe(Effect.map((r) => r.data)),
        complete: (id: number) =>
          api.post(`/projects/complete/${id}`, {}, StoreEventsResponse),
        completeProjectDate: (id: number) =>
          api.post(`/projectDates/complete/${id}`, {}, StoreEventsResponse),
      }
    }),
    dependencies: [ClockinApiClient.Default],
  },
) {}
