import { defineWidget } from "./runtime"

// ---------------------------------------------------------------------------
// time-overview — time_overview card
// ---------------------------------------------------------------------------
// Renders the TimeOverview payload: this week's worked-vs-target bar plus a grid
// of month total, overtime, flextime and vacation. Hours arrive as decimals and
// are humanized with fmtHours.

export const timeOverviewWidget = defineWidget({
  name: "clockin-time-overview",
  uri: "ui://clockin/time-overview.html",
  title: "Time overview",
  description: "Interactive time-balance overview widget.",
  loading: "Loading time overview…",
  render: `
    function render(d) {
      var w = d.currentWeek, m = d.currentMonth;
      var target = w ? w.targetHours : 0;
      var worked = w ? w.workedHours : 0;
      var toGo = w ? Math.max(0, w.remainingHours) : 0;
      var pct = target > 0 ? Math.min(100, Math.round((worked / target) * 100)) : 0;
      var flex = d.annualFlextimeHours, hasFlex = flex != null;
      var maxVac = d.maxVacationDays, usedVac = d.usedVacationDays;

      var html = '<div class="card"><div class="head">';
      html += '<span class="title">This week</span>';
      html += '<span class="sub">target ' + fmtHours(target) + "</span></div>";
      html += '<div class="body">';
      html += '<div class="bartop"><span><b>' + fmtHours(worked) + "</b> worked</span>";
      html += '<span class="muted">' + fmtHours(toGo) + " to go</span></div>";
      html += '<div class="track"><div class="fill" data-pct="' + pct + '"></div></div>';
      html += '<div class="grid" style="margin-top:16px">';
      html += row("This month", m ? fmtHours(m.workedHours) + " / " + fmtHours(m.targetHours) : "\\u2014");
      if (m && m.overtimeHours > 0) html += row("Overtime", "+" + fmtHours(m.overtimeHours), true);
      html += row("Flextime", hasFlex ? (flex >= 0 ? "+" : "") + fmtHours(flex) : "\\u2014", hasFlex && flex >= 0);
      html += row("Vacation", maxVac != null ? ((usedVac || 0) + " / " + maxVac + " days") : "\\u2014");
      html += "</div></div></div>";
      root.innerHTML = html;
    }
  `,
})
