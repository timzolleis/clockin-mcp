import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { user } from "./auth-schema"

export const userToken = sqliteTable("user_token", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // user_token: covers /timesheet, /correction, /absence, /admin/*, ...
  userCiphertext: text("user_ciphertext").notNull(),
  userIv: text("user_iv").notNull(),
  userAuthTag: text("user_auth_tag").notNull(),
  // device_token: covers /events, /workdays, /projects, /device/*, ...
  deviceCiphertext: text("device_ciphertext").notNull(),
  deviceIv: text("device_iv").notNull(),
  deviceAuthTag: text("device_auth_tag").notNull(),
  // Clockin employee id, needed in every event payload.
  employeeId: integer("employee_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
})
