import { Schema } from "effect"
import { UserId } from "./user-id"

export class CredentialsNotFoundError extends Schema.TaggedError<CredentialsNotFoundError>()(
  "CredentialsNotFoundError",
  { userId: UserId },
) {}
