import { Schema } from "effect"
import { Envelope } from "~/lib/domain/shared"

// /device/config returns a Configuration. For personal accounts, `user_id` is
// the current employee_id used in event payloads.
export const DeviceConfig = Schema.Struct({
  company_id: Schema.optional(Schema.Number),
  device_id: Schema.optional(Schema.Number),
  user_id: Schema.optional(Schema.Number),
  employee_id: Schema.optional(Schema.Number),
})
export type DeviceConfig = Schema.Schema.Type<typeof DeviceConfig>

export const DeviceConfigResponse = Envelope(DeviceConfig)
