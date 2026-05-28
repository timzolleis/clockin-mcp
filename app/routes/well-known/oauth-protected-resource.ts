import { Effect } from "effect"
import { serverClient } from "~/lib/auth-server-client"
import { AppConfig } from "~/lib/config/app-config"
import { serverRuntime } from "~/lib/effect/runtime"

export const loader = async () => {
  const { baseUrl } = await serverRuntime.runPromise(AppConfig.pipe(Effect.map((c) => c)))
  const metadata = await serverClient.getProtectedResourceMetadata({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
  })

  return Response.json(metadata, {
    headers: {
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  })
}
