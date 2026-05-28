import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("consent", "routes/consent.tsx"),

  // Protected SPA routes — auth check + ClientOnly wrapper happens in the layout.
  layout("routes/protected-layout.tsx", [
    route("settings", "routes/settings.tsx"),
  ]),

  route("api/auth/*", "routes/api.auth.ts"),

  // MCP transports (mcp-handler reads basePath="/" → /mcp = streamable, /sse = legacy SSE).
  // Both routes share the same handler module, distinguished by id.
  route("mcp", "routes/api.mcp.ts", { id: "mcp-streamable" }),
  route("sse", "routes/api.mcp.ts", { id: "mcp-sse" }),
  route("message", "routes/api.mcp.ts", { id: "mcp-message" }),

  route("api/v1/*", "routes/api.v1.$.ts"),
  // RFC8414: issuer path inserted *after* /.well-known/oauth-authorization-server
  route(
    ".well-known/oauth-authorization-server/api/auth",
    "routes/well-known/oauth-authorization-server.ts",
  ),
  // Root fallback — MCP Inspector and other clients probe the unsuffixed form.
  route(
    ".well-known/oauth-authorization-server",
    "routes/well-known/oauth-authorization-server-root.ts",
  ),
  // OIDC discovery: issuer path *before* /.well-known/openid-configuration
  route(
    "api/auth/.well-known/openid-configuration",
    "routes/well-known/openid-configuration.ts",
  ),
  // Root fallback for clients that hardcode the path
  route(
    ".well-known/openid-configuration",
    "routes/well-known/openid-configuration-root.ts",
  ),
  route(
    ".well-known/oauth-protected-resource/mcp",
    "routes/well-known/oauth-protected-resource.ts",
  ),
  // Root fallback — MCP Inspector probes the unsuffixed form too.
  route(
    ".well-known/oauth-protected-resource",
    "routes/well-known/oauth-protected-resource-root.ts",
  ),
] satisfies RouteConfig
