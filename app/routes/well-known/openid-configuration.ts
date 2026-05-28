import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { auth } from "~/lib/auth"
import type { Route } from "./+types/openid-configuration"

const handler = oauthProviderOpenIdConfigMetadata(auth)

export const loader = ({ request }: Route.LoaderArgs) => handler(request)
