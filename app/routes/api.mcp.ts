import { getMcpHandler } from "~/lib/mcp.server"
import type { Route } from "./+types/api.mcp"

export const loader = ({ request, context }: Route.LoaderArgs) =>
  getMcpHandler(context)(request)
export const action = ({ request, context }: Route.ActionArgs) =>
  getMcpHandler(context)(request)
