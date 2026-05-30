import { Context } from "effect"
import type { AppLoadContext } from "react-router"

// The React Router v7 request context (carries `cloudflare.env`, hence the D1
// binding and every secret). Injected PER REQUEST into the Effect runtime via
// the second arg of the web handler — see `v1-handler.server.ts`. Everything
// env-derived (D1, config) is built from this inside per-request effects.
export class AppContext extends Context.Tag("AppContext")<
  AppContext,
  AppLoadContext
>() {}
