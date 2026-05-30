import { HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type {
  ClockinUnauthenticatedError,
  ClockinValidationError
} from "./clockin-api-errors";
import type { CurrentClockinCredentials } from "./clockin-client";
import { DeviceClockinClient, onlyClockinErrors } from "./clockin-client";
import type { DeviceConfig, Employee } from "~/lib/domain/employee";
import {
  DeviceConfigResponse,
  EmployeeArrayResponse,
  EmployeeResponse,
  TaskConfigsResponse
} from "~/lib/domain/employee";
import type { EmployeeId } from "~/lib/domain/employee";

// ---------------------------------------------------------------------------
// Service interface (define the shape first; implement as a Layer later)
// ---------------------------------------------------------------------------

export interface ClockinEmployeeService {
  /**
   * List the employees visible to this device. Used during setup to discover
   * the `employee_id` baked into event payloads.
   *
   * `GET /device/employees` (device_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly employees: () => Effect.Effect<
    ReadonlyArray<Employee>,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * Fetch a single employee by id.
   *
   * `GET /device/employee/{employeeId}` (device_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly employee: (
    employeeId: EmployeeId
  ) => Effect.Effect<Employee, ClockinUnauthenticatedError, CurrentClockinCredentials>;

  /**
   * Read this device's configuration. For personal accounts, `user_id`/
   * `employee_id` is the id used in event payloads.
   *
   * `GET /device/config` (device_token) → 401 bad/missing token.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly config: () => Effect.Effect<
    DeviceConfig,
    ClockinUnauthenticatedError,
    CurrentClockinCredentials
  >;

  /**
   * List the task IDs enabled for this device.
   *
   * `GET /device/taskConfigs` (device_token) → 401 bad/missing token, 422 validation.
   * Transport/decode failures are defects, not part of this channel.
   */
  readonly taskConfigs: () => Effect.Effect<
    ReadonlyArray<number>,
    ClockinUnauthenticatedError | ClockinValidationError,
    CurrentClockinCredentials
  >;
}

export class ClockinEmployee extends Context.Tag("ClockinEmployee")<
  ClockinEmployee,
  ClockinEmployeeService
>() { }

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------
// Every op is device-tier, riding the DeviceClockinClient (device_token) and
// reading `CurrentClockinCredentials` per request. `onlyClockinErrors` keeps
// each op's documented statuses and turns every other failure (undocumented
// status, transport, decode) into a defect.

export const ClockinEmployeeLive = Layer.effect(
  ClockinEmployee,
  Effect.gen(function* () {
    const device = yield* DeviceClockinClient;

    return ClockinEmployee.of({
      employees: () =>
        device.get("/device/employees").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(EmployeeArrayResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      employee: (employeeId) =>
        device.get(`/device/employee/${employeeId}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(EmployeeResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      config: () =>
        device.get("/device/config").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceConfigResponse)),
          Effect.map((r) => r.data),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError")
        ),

      taskConfigs: () =>
        device.get("/device/taskConfigs").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(TaskConfigsResponse)),
          Effect.map((r) => r.data.map((t) => t.task_id)),
          Effect.scoped,
          onlyClockinErrors("ClockinUnauthenticatedError", "ClockinValidationError")
        )
    });
  })
).pipe(Layer.provide([DeviceClockinClient.Default]));
