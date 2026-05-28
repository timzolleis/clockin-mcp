import { Effect } from "effect"
import { ClockinApiClient, ClockinTokens } from "./client"
import {
  DeviceConfigResponse,
  EmployeeArrayResponse,
  EmployeeResponse,
  TaskConfigsResponse,
} from "./schemas"

export class ClockinEmployee extends Effect.Service<ClockinEmployee>()(
  "ClockinEmployee",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient
      return {
        config: () =>
          api
            .get("/device/config", DeviceConfigResponse)
            .pipe(Effect.map((r) => r.data)),
        // Employees this device is allowed to record events for. For personal
        // accounts this is exactly one — the employee whose id we need for
        // /events/storeMany.
        employees: () =>
          api
            .get("/device/employees", EmployeeArrayResponse)
            .pipe(Effect.map((r) => r.data)),
        me: () =>
          Effect.flatMap(ClockinTokens, (t) =>
            api.get(`/device/employee/${t.employeeId}`, EmployeeResponse),
          ).pipe(Effect.map((r) => r.data)),
        get: (id: number) =>
          api
            .get(`/device/employee/${id}`, EmployeeResponse)
            .pipe(Effect.map((r) => r.data)),
        taskConfigs: () =>
          api
            .get("/device/taskConfigs", TaskConfigsResponse)
            .pipe(Effect.map((r) => r.data)),
      }
    }),
    dependencies: [ClockinApiClient.Default],
  },
) {}
