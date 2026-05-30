import { Effect } from "effect"
import { AuthService } from "~/lib/auth"
import { cloudflareEnvLayer } from "~/lib/effect/cloudflare-env"

// Provide the effectful better-auth instance to `effect`. `AuthService.Default`
// bottoms out at a single env-derived leaf — `CloudflareEnv` — from which its
// D1 binding and config (BETTER_AUTH_SECRET/URL) are derived. We build per
// request rather than memoizing a per-env runtime: the betterAuth instance is
// stateless (sessions live in D1), so there's nothing to share.
export const provideAuth =
  (env: Env) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | AuthService>) =>
    effect.pipe(
      Effect.provide(AuthService.Default),
      Effect.provide(cloudflareEnvLayer(env)),
    )
