import { defineWidget } from "./runtime"

// ---------------------------------------------------------------------------
// confirm — the shared action-result card
// ---------------------------------------------------------------------------
// Reused by every event tool (clock in/out, break, resume, project work). The
// tool result carries a `display: { tone, title, at?, detail? }` block that the
// server builds, so this widget stays dumb: tone picks the badge, `at` (ISO) is
// localized to a clock time in the iframe, `detail` is plain text. The richer
// structured fields (today's totals, away duration) ride alongside for the
// model; this card just shows the headline.

export const confirmWidget = defineWidget({
  name: "clockin-confirm",
  uri: "ui://clockin/confirm.html",
  title: "Action confirmation",
  description: "Confirmation card for a clock-in / out / break / resume / project action.",
  loading: "Working…",
  render: `
    function render(d) {
      var c = (d && d.display) ? d.display : (d || {});
      var tone = c.tone === "iris" ? "iris" : (c.tone === "error" ? "error" : "good");
      var mark = tone === "iris" ? "\\u275A\\u275A" : (tone === "error" ? "\\u2715" : "\\u2713");
      var at = c.at ? " at " + fmtClock(c.at) : "";
      var html = '<div class="confirm">';
      html += '<span class="badge ' + tone + '">' + mark + "</span>";
      html += "<div><div class=\\"c-title\\">" + esc(c.title || "Done") + esc(at) + "</div>";
      if (c.detail) html += '<div class="c-detail">' + esc(c.detail) + "</div>";
      html += "</div></div>";
      root.innerHTML = html;
    }
  `,
})
