import { createAuthClient } from "better-auth/client"
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import type { Auth } from "~/lib/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createServerClient = (auth: Auth) =>
  createAuthClient({
    plugins: [oauthProviderResourceClient(auth as any)],
  })

export type ServerClient = ReturnType<typeof createServerClient>
