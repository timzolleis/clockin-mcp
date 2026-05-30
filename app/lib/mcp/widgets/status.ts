import { defineWidget } from "./runtime"

// ---------------------------------------------------------------------------
// status — current_status card
// ---------------------------------------------------------------------------
// Renders the CurrentStatus payload: a live dot while on the clock, the state
// label, when it started (localized), how long it's lasted, and the project.

export const statusWidget = defineWidget({
  name: "clockin-status",
  uri: "ui://clockin/status.html",
  title: "Current status",
  description: "Live card showing what you're currently doing.",
  loading: "Checking status…",
  render: `
    var LABELS = {
      working: "Working",
      working_on_project: "Working on project",
      on_break: "On break",
      clocked_out: "Clocked out",
      driving: "Driving",
      loading: "Loading",
      business_trip: "Business trip",
      special: "Special task",
      unknown: "Status unknown"
    };
    function render(d) {
      var live = d.state && d.state !== "clocked_out";
      var label = LABELS[d.state] || "Status";
      var html = '<div class="card"><div class="head">';
      html += "<span class=\\"title\\" style=\\"display:flex;align-items:center;gap:8px\\">";
      if (live) html += '<span class="dot"><span class="ping"></span><span class="core"></span></span>';
      html += esc(label) + "</span></div>";
      if (!d.since) {
        // Clocked out (or unknown): no timeline to show — lean on the prose.
        html += '<div class="body"><div class="muted" style="font-size:12.5px">' +
          esc(d.description || "Not currently clocked in.") + "</div></div>";
      } else {
        html += '<div class="body grid">';
        if (d.project && d.project.name) html += row("Project", esc(d.project.name));
        html += row("Since", fmtClock(d.since));
        if (d.forSeconds) html += row("For", fmtDur(d.forSeconds));
        html += "</div>";
      }
      html += "</div>";
      root.innerHTML = html;
    }
  `,
})
