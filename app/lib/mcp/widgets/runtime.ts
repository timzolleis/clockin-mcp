// ---------------------------------------------------------------------------
// Shared widget runtime (MCP Apps / SEP-1865)
// ---------------------------------------------------------------------------
// Every clockin widget is a self-contained HTML document that compatible hosts
// (Claude / Claude Desktop on a paid plan, added as a custom connector) mount
// in a sandboxed iframe. The host fetches the `ui://` resource, mounts it, and
// pushes the tool's JSON result in via `ui/notifications/tool-result`; the
// widget parses that and renders a card. Clients without MCP Apps ignore the
// tool's `_meta.ui.resourceUri` and just show the JSON text we already return.
//
// This module is the *shell* every widget shares: the design tokens + card
// primitives (mirroring the landing cards), a small browser-side helper library
// (duration/clock/date formatting, escaping, rows), and the App boilerplate
// that wires connect + ontoolresult + the bar animation. Each widget only
// supplies its own `render(d)` body (and any extra CSS). That keeps widgets
// small and the boilerplate in exactly one place.
//
// CONSTRAINT: `render`/`css` are injected verbatim into a template literal, so
// they must not contain backticks or `${...}`. Use string concatenation.

/** Hosts must allow this origin so the widget can load the client runtime. */
export const RESOURCE_DOMAINS = ["https://esm.sh"]

const EXT_APPS_URL =
  "https://esm.sh/@modelcontextprotocol/ext-apps@1.7.2/app-with-deps"

/** A registered widget: its `ui://` URI, listing metadata, and built HTML. */
export interface Widget {
  uri: string
  title: string
  description: string
  html: string
}

export interface WidgetSpec {
  /** App name reported to the host. */
  name: string
  uri: string
  title: string
  description: string
  /** Text shown before the first tool result arrives. */
  loading?: string
  /** Extra CSS appended after the shared base. No backticks / `${}`. */
  css?: string
  /**
   * Browser-side source defining `function render(d) { ... }`. Receives the
   * parsed tool result, writes into `root`, may emit `[data-pct]` fills which
   * the shell animates. No backticks / `${}`.
   */
  render: string
}

// Design tokens + primitives shared by every card. Mirrors app/components/landing.
const baseCss = `
  :root {
    --bg: #0d0e11; --bg2: #15171c; --bg3: #1f2229;
    --line: rgba(255,255,255,0.08); --line2: rgba(255,255,255,0.06);
    --ink: #f3f4f7; --ink2: #c7cad2; --ink3: #9398a3; --ink4: #686d78;
    --iris: #7c84ff; --iris2: #9aa0ff; --good: #4ade80; --bad: #f87171;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); }
  body {
    font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    color: var(--ink2); padding: 14px;
  }
  .card {
    max-width: 420px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--bg2); overflow: hidden;
  }
  .head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding: 12px 15px; border-bottom: 1px solid var(--line2);
  }
  .title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .sub { font-size: 12px; color: var(--ink4); font-variant-numeric: tabular-nums; }
  .body { padding: 14px 15px 16px; }
  .muted { color: var(--ink3); }
  .empty { padding: 20px; color: var(--ink4); font-size: 13px; }

  /* key/value grid */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
  .row { padding: 7px 0; }
  .k { font-size: 11.5px; color: var(--ink4); margin-bottom: 3px; }
  .v { font: 13px/1.2 ui-monospace, "JetBrains Mono", monospace; color: var(--ink); }
  .v.pos { color: var(--good); }

  /* progress bar */
  .bartop { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 8px; }
  .bartop b { color: var(--ink); font-weight: 600; }
  .track { height: 6px; border-radius: 99px; background: var(--bg3); overflow: hidden; }
  .fill {
    height: 100%; border-radius: 99px; width: 0;
    background: linear-gradient(90deg, var(--iris), var(--iris2));
    transition: width .9s cubic-bezier(.22,1,.36,1);
  }

  /* live status dot */
  .dot { position: relative; display: inline-flex; width: 8px; height: 8px; margin-right: 2px; }
  .dot .ping {
    position: absolute; inset: 0; border-radius: 99px; background: var(--good);
    opacity: .55; animation: ping 1.6s cubic-bezier(0,0,.2,1) infinite;
  }
  .dot .core { position: relative; width: 8px; height: 8px; border-radius: 99px; background: var(--good); }
  @keyframes ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .dot .ping { animation: none; } .fill { transition: none; } }

  /* simple list (projects) */
  .item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 15px; border-top: 1px solid var(--line2);
  }
  .item:first-child { border-top: 0; }
  .item .name { font-size: 13px; color: var(--ink2); }
  .item .id { font: 11px/1 ui-monospace, monospace; color: var(--ink4); }

  /* confirm card */
  .confirm {
    display: flex; align-items: flex-start; gap: 10px; max-width: 420px;
    border: 1px solid var(--line); border-radius: 12px; background: var(--bg2);
    padding: 12px 14px;
  }
  .badge {
    flex: none; display: flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; margin-top: 1px; border-radius: 99px; font-size: 10px;
  }
  .badge.good { background: rgba(74,222,128,0.15); color: var(--good); }
  .badge.iris { background: rgba(124,132,255,0.15); color: var(--iris); }
  .badge.error { background: rgba(248,113,113,0.15); color: var(--bad); }
  .c-title { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .c-detail { margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: var(--ink3); }

  /* workday rows */
  .wd { display: flex; align-items: center; gap: 12px; }
  .wd + .wd { margin-top: 12px; }
  .wd-label { width: 58px; flex: none; }
  .wd-day { font-size: 12.5px; font-weight: 500; color: var(--ink); }
  .wd-date { font-size: 10.5px; color: var(--ink4); }
  .wd-bar { flex: 1; height: 6px; border-radius: 99px; background: var(--bg3); overflow: hidden; }
  .wd-total {
    width: 62px; flex: none; text-align: right;
    font: 11.5px/1 ui-monospace, monospace; color: var(--ink2);
  }
`

// Browser-side helper library, shared by every render(). Mirrors the server's
// formatDuration so a widget and the agent's text agree. Clock/date formatting
// runs in the host iframe, so it is correctly localized to the user's timezone
// (the server runs in UTC and intentionally leaves times as ISO).
const helpersJs = `
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtDur(seconds) {
    var s = Math.max(0, Math.round(Number(seconds) || 0));
    if (s < 60) return s + "s";
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h === 0) return m + "m";
    if (m === 0) return h + "h";
    return h + "h " + m + "m";
  }
  function fmtHours(hours) {
    if (hours == null) return "\\u2014";
    var neg = hours < 0, total = Math.round(Math.abs(hours) * 60);
    var hh = Math.floor(total / 60), mm = total % 60;
    var s = mm === 0 ? hh + "h" : hh + "h " + (mm < 10 ? "0" + mm : mm) + "m";
    return (neg ? "-" : "") + s;
  }
  function fmtClock(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtWeekday(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : WEEKDAYS[d.getDay()]; }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : MONTHS[d.getMonth()] + " " + d.getDate(); }
  function row(k, v, pos) {
    return '<div class="row"><div class="k">' + esc(k) + '</div>' +
      '<div class="v' + (pos ? " pos" : "") + '">' + v + "</div></div>";
  }
`

/** Build a complete, self-contained widget HTML document from a spec. */
export const widgetDocument = (spec: WidgetSpec): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${baseCss}${spec.css ?? ""}</style>
</head>
<body>
<div id="root"><div class="empty">${spec.loading ?? "Loading…"}</div></div>
<script type="module">
  import { App } from "${EXT_APPS_URL}";

  var root = document.getElementById("root");
${helpersJs}
${spec.render}

  // Animate any [data-pct] fills the render produced (width starts at 0 in CSS).
  function paint() {
    var fills = root.querySelectorAll("[data-pct]");
    requestAnimationFrame(function () {
      for (var i = 0; i < fills.length; i++) {
        fills[i].style.width = fills[i].getAttribute("data-pct") + "%";
      }
    });
  }

  var app = new App({ name: "${spec.name}", version: "0.1.0" });

  app.ontoolresult = function (params) {
    try {
      var blocks = (params && params.content) || [];
      var textBlock = blocks.find(function (b) { return b.type === "text"; });
      if (!textBlock) return;
      render(JSON.parse(textBlock.text));
      paint();
    } catch (e) {
      root.innerHTML = '<div class="empty">Could not render this view.</div>';
    }
  };

  app.connect().catch(function () {
    root.innerHTML = '<div class="empty">Could not connect to host.</div>';
  });
</script>
</body>
</html>`

/** Assemble a {@link Widget} from a spec (builds the HTML once). */
export const defineWidget = (spec: WidgetSpec): Widget => ({
  uri: spec.uri,
  title: spec.title,
  description: spec.description,
  html: widgetDocument(spec),
})
