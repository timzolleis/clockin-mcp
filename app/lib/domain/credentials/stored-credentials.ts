import { Schema } from "effect"
import { EmployeeId } from "~/lib/domain/employee"
import { EncryptedToken } from "~/lib/effect/vault.server"
import { UserId } from "./user-id"

/**
 * Persisted form of a user's Clockin credentials. Tokens stay encrypted at
 * this layer — decryption happens one step up, when building
 * `ClockinCredentials` for an outbound request.
 */
export class StoredCredentials extends Schema.Class<StoredCredentials>(
  "StoredCredentials",
)({
  userId: UserId,
  employeeId: EmployeeId,
  userToken: EncryptedToken,
  deviceToken: EncryptedToken,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
