// Reusable MCP Apps widgets, one module each, assembled from the shared shell
// in ./runtime. `registerWidgetResources` registers every widget's `ui://`
// resource on a server in one call; tools then point `_meta.ui.resourceUri` at
// the relevant `*.uri`.

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import { confirmWidget } from "./confirm"
import { projectsWidget } from "./projects"
import { statusWidget } from "./status"
import { timeOverviewWidget } from "./time-overview"
import { workdaysWidget } from "./workdays"
import { RESOURCE_DOMAINS, type Widget } from "./runtime"

export { confirmWidget } from "./confirm"
export { projectsWidget } from "./projects"
export { statusWidget } from "./status"
export { timeOverviewWidget } from "./time-overview"
export { workdaysWidget } from "./workdays"
export type { Widget } from "./runtime"

/** Every widget the server ships. */
export const WIDGETS: readonly Widget[] = [
  statusWidget,
  confirmWidget,
  projectsWidget,
  workdaysWidget,
  timeOverviewWidget,
]

/** Register every widget's HTML resource on the server (call once per server). */
export const registerWidgetResources = (
  server: Pick<McpServer, "registerResource">,
): void => {
  for (const widget of WIDGETS) {
    registerAppResource(
      server,
      widget.title,
      widget.uri,
      {
        description: widget.description,
        // The widgets load the official MCP Apps runtime from esm.sh; the
        // host's iframe CSP must allow that origin for scripts.
        _meta: { ui: { csp: { resourceDomains: RESOURCE_DOMAINS } } },
      },
      () => ({
        contents: [
          { uri: widget.uri, mimeType: RESOURCE_MIME_TYPE, text: widget.html },
        ],
      }),
    )
  }
}
