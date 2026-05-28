// Root-fallback for clients that ignore RFC 8414 path-insertion and
// hardcode `/.well-known/oauth-authorization-server`. Mirrors the path-suffixed
// route at `/.well-known/oauth-authorization-server/api/auth`.
export { loader } from "./oauth-authorization-server"
