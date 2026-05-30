import { Context, type Effect } from "effect"
import type {
  CredentialsNotFoundError,
  StoredCredentials,
  UserId,
} from "~/lib/domain/credentials"

type SaveCredentialsInput = Pick<
  StoredCredentials,
  "userId" | "employeeId" | "userToken" | "deviceToken"
>

export interface CredentialsRepositoryShape {
  findByUser: (args: {
    userId: UserId
  }) => Effect.Effect<StoredCredentials, CredentialsNotFoundError>
  save: (args: SaveCredentialsInput) => Effect.Effect<StoredCredentials>
}

export class CredentialsRepository extends Context.Tag("CredentialsRepository")<
  CredentialsRepository,
  CredentialsRepositoryShape
>() {}
