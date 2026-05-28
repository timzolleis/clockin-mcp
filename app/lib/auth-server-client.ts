import { createAuthClient } from "better-auth/client"
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { auth } from "~/lib/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const serverClient = createAuthClient({
  plugins: [oauthProviderResourceClient(auth as any)],
})
