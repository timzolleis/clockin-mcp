import { Context, Effect, Redacted, Schema } from "effect"
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform"
import { ClockinConfig } from "~/lib/config/clockin-config"

export class ClockinTokens extends Context.Tag("ClockinTokens")<
  ClockinTokens,
  {
    readonly userToken: Redacted.Redacted<string>
    readonly deviceToken: Redacted.Redacted<string>
    readonly employeeId: number
  }
>() {}

const NO_AUTH: ReadonlySet<string> = new Set([
  "/device/upgrade/appv1/appv2",
  "/auth/login",
  "/auth/code/login",
  "/auth/user/login",
  "/auth/user/resetPassword",
  "/registration/company",
  "/registration/v2/company",
])

const USER_PREFIXES: readonly string[] = [
  "/absence",
  "/company-absence-types",
  "/correction",
  "/timesheet",
  "/auth/user/logout",
  "/auth/user/officeSessionUrl",
  "/auth/user/authorizeQrLogin",
  "/survey",
  "/possibleAbsenceSubstitutes",
  "/travelLog/showMany",
  "/admin/nfc-tags",
  "/shift-plan",
  "/admin/",
  "/app-onboarding-tours",
]

type Tier = "none" | "user" | "device"

const tierFor = (path: string): Tier => {
  if (NO_AUTH.has(path)) return "none"
  if (USER_PREFIXES.some((p) => path.startsWith(p))) return "user"
  return "device"
}

const DEVICE_INFO = JSON.stringify({
  app_build: "0",
  app_version: "0.1.0",
  device_model: "mcp",
  operating_system: "mcp",
  os_version: "1",
})

export class ClockinApiClient extends Effect.Service<ClockinApiClient>()(
  "ClockinApiClient",
  {
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const { baseUrl } = yield* ClockinConfig

      const decorate = (
        req: HttpClientRequest.HttpClientRequest,
        path: string,
      ) => {
        // Without `Accept: application/json` Laravel falls out of the API
        // middleware group → web routes don't have /v2/events/storeMany → 404
        // HTML. The other headers mirror the iOS app's outgoing request.
        const withHeaders = HttpClientRequest.setHeaders(req, {
          accept: "application/json",
          "device-information": DEVICE_INFO,
        })
        const tier = tierFor(path)
        if (tier === "none") return Effect.succeed(withHeaders)
        return Effect.map(ClockinTokens, (tokens) => {
          const t = tier === "user" ? tokens.userToken : tokens.deviceToken
          return HttpClientRequest.bearerToken(withHeaders, Redacted.value(t))
        })
      }

      // On 4xx/5xx we surface the upstream body in the thrown error so it
      // flows through mapServerError → the API response. mapServerError
      // logs the cause, so no dedicated logging needed here.
      const execute = (
        req: HttpClientRequest.HttpClientRequest,
        path: string,
      ) =>
        decorate(req, path).pipe(
          Effect.flatMap(http.execute),
          Effect.flatMap((res) =>
            res.status >= 400
              ? res.text.pipe(
                  Effect.catchAll(() => Effect.succeed("(could not read body)")),
                  Effect.flatMap((body) =>
                    Effect.fail(
                      new Error(
                        `Clockin ${req.method} ${req.url} → ${res.status}: ${body}`,
                      ),
                    ),
                  ),
                )
              : Effect.succeed(res),
          ),
        )

      const url = (path: string) => `${baseUrl}${path}`

      const decoded =
        <A, I, R>(schema: Schema.Schema<A, I, R>) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          HttpClientResponse.schemaBodyJson(schema)(response)

      const encodeBody = <A, I>(
        schema: Schema.Schema<A, I, never>,
        value: A,
      ): I => Schema.encodeSync(schema)(value)

      return {
        baseUrl,
        get: <A, I, R>(path: string, response: Schema.Schema<A, I, R>) =>
          execute(HttpClientRequest.get(url(path)), path).pipe(
            Effect.flatMap(decoded(response)),
            Effect.scoped,
          ),

        post: <A, I, R>(
          path: string,
          body: unknown,
          response: Schema.Schema<A, I, R>,
        ) =>
          execute(
            HttpClientRequest.post(url(path)).pipe(
              HttpClientRequest.setBody(HttpBody.unsafeJson(body)),
            ),
            path,
          ).pipe(Effect.flatMap(decoded(response)), Effect.scoped),

        patch: <A, I, R>(
          path: string,
          body: unknown,
          response: Schema.Schema<A, I, R>,
        ) =>
          execute(
            HttpClientRequest.patch(url(path)).pipe(
              HttpClientRequest.setBody(HttpBody.unsafeJson(body)),
            ),
            path,
          ).pipe(Effect.flatMap(decoded(response)), Effect.scoped),

        del: <A, I, R>(path: string, response: Schema.Schema<A, I, R>) =>
          execute(HttpClientRequest.del(url(path)), path).pipe(
            Effect.flatMap(decoded(response)),
            Effect.scoped,
          ),

        encodeBody,
      }
    }),
    dependencies: [FetchHttpClient.layer, ClockinConfig.layer],
  },
) {}
