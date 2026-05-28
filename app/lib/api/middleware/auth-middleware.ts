import { HttpApiMiddleware } from "@effect/platform"
import { Context } from "effect"
import { UnauthorizedError } from "~/lib/api/errors"

export interface AuthenticatedUserData {
  readonly id: string
  readonly email: string
  readonly name: string
}

export class AuthenticatedUser extends Context.Tag("AuthenticatedUser")<
  AuthenticatedUser,
  AuthenticatedUserData
>() {}

export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
  "AuthMiddleware",
  {
    provides: AuthenticatedUser,
    failure: UnauthorizedError,
  },
) {}
