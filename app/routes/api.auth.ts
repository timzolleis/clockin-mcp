import { auth } from "~/lib/auth"
import type { Route } from "./+types/api.auth"

export const loader = ({ request }: Route.LoaderArgs) => auth.handler(request)
export const action = ({ request }: Route.ActionArgs) => auth.handler(request)
