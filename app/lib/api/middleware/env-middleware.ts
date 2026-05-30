import { HttpApiMiddleware } from "@effect/platform"
import { CloudflareEnv } from "~/lib/effect/cloudflare-env"

// Middleware that resolves THIS request's Worker `Env` (D1 binding + secrets)
// and provides it as `CloudflareEnv`. Everything env-derived (database, token
// vault, Clockin config) bottoms out at this single leaf, so providing it here
// lets handlers pull the whole request-scoped service graph without `AppContext`
// ever becoming a static build requirement — see `env-middleware.server.ts`.
export class EnvMiddleware extends HttpApiMiddleware.Tag<EnvMiddleware>()(
  "EnvMiddleware",
  {
    provides: CloudflareEnv,
  },
) {}
