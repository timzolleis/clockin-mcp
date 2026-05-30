import { handleV1 } from "~/lib/api/v1-handler.server"
import type { Route } from "./+types/api.v1.$"

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleV1(request, context)
export const action = ({ request, context }: Route.ActionArgs) =>
  handleV1(request, context)
