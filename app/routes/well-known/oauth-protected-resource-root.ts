// Root-fallback for clients that probe `/.well-known/oauth-protected-resource`
// without the resource-path suffix. Returns the same metadata as the
// suffixed route at `/.well-known/oauth-protected-resource/mcp`.
export { loader } from "./oauth-protected-resource"
