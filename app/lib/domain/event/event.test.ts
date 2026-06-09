import { Schema } from "effect"
import { assert, describe, it } from "vitest"
import { EventRead } from "./event"

describe("EventRead", () => {
  // Corrected/backfilled events come back with `uuid: null` (not just missing).
  it("decodes an upstream event whose uuid is null", () => {
    const decoded = Schema.decodeUnknownSync(EventRead)({
      id: 164218006,
      device_id: 425630,
      employee_id: 259805,
      project_id: 1093352,
      site_id: null,
      project_date_id: null,
      task_id: 4,
      task_label: "Projekt",
      occured_at: "2026-06-02T08:30:00.000000Z",
      is_workplan_event: null,
      is_deleted: false,
      site: null,
      uuid: null,
    })
    assert.strictEqual(decoded.uuid, null)
    assert.strictEqual(decoded.occured_at, "2026-06-02T08:30:00.000000Z")
    assert.strictEqual(decoded.task_id, 4)
  })
})
