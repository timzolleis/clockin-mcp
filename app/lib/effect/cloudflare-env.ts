import { Context, Layer } from "effect"

// The Worker `Env` (D1 binding + secrets) as a single Effect service. This is
// the ONE env-derived leaf the whole graph bottoms out at: the D1 binding and
// every config layer (`AuthConfig`, `ClockinConfig`, `TokenEncryptionConfig`)
// are derived from it. Provided per request from `context.cloudflare.env` —
// see `provideAuth` and `RequestServicesLive`.
//
// Using a Tag instead of `Config.*` + `setConfigProvider` makes the requirement
// type-visible: forget to provide it and nothing compiles, rather than failing
// at runtime when a `Config` read silently falls back to the (empty) default
// provider on Workers.
export class CloudflareEnv extends Context.Tag("CloudflareEnv")<
  CloudflareEnv,
  Env
>() {}

// Convenience: the per-request layer carrying this request's env.
export const cloudflareEnvLayer = (env: Env) => Layer.succeed(CloudflareEnv, env)
