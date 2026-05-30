import { Schema } from "effect"
import { EmployeeId } from "~/lib/domain/employee"

/**
 * In-memory form of a user's Clockin credentials. Tokens are decrypted and
 * wrapped in Redacted to keep them out of logs/spans.
 */
export class ClockinCredentials extends Schema.Class<ClockinCredentials>(
  "ClockinCredentials",
)({
  employeeId: EmployeeId,
  userToken: Schema.Redacted(Schema.String),
  deviceToken: Schema.Redacted(Schema.String),
}) {}
