import { Effect, Redacted, Schema } from "effect"
import { ClockinApiClient, ClockinTokens } from "./client"
import { LogoutResponse, PersonalLoginResponse } from "./schemas"

const Credentials = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
})

// Login is unauthenticated, but the api client's type signature still requires
// ClockinTokens. We inject empty placeholders; the routing layer skips bearer
// token injection for `/auth/user/login`.
const PLACEHOLDER_TOKENS = {
  userToken: Redacted.make(""),
  deviceToken: Redacted.make(""),
  employeeId: 0,
}

export class ClockinAuth extends Effect.Service<ClockinAuth>()(
  "ClockinAuth",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient
      return {
        login: (email: string, password: string) =>
          api
            .post(
              "/auth/user/login",
              api.encodeBody(Credentials, { email, password }),
              PersonalLoginResponse,
            )
            .pipe(
              Effect.map((r) => r.data),
              Effect.provideService(ClockinTokens, PLACEHOLDER_TOKENS),
            ),
        logout: () => api.post("/auth/user/logout", {}, LogoutResponse),
      }
    }),
    dependencies: [ClockinApiClient.Default],
  },
) {}
