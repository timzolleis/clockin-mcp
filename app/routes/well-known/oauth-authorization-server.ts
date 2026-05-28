import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth } from "~/lib/auth"
import type { Route } from "./+types/oauth-authorization-server"

const handler = oauthProviderAuthServerMetadata(auth)

export const loader = ({ request }: Route.LoaderArgs) => handler(request)
