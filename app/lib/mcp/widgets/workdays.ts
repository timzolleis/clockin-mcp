import { defineWidget } from "./runtime"

// ---------------------------------------------------------------------------
// workdays — list_workdays card
// ---------------------------------------------------------------------------
// The tool returns WorkdaySummary[]. Show each day as a bar of worked time
// relative to a nominal 8h day, with the formatted total on the right —
// mirroring the landing WorkdaysCard. Day/date labels are derived from the ISO
// start (localized in the iframe), falling back to the raw `date` string.

const EIGHT_HOURS = 8 * 3600

export const workdaysWidget = defineWidget({
  name: "clockin-workdays",
  uri: "ui://clockin/workdays.html",
  title: "Recent workdays",
  description: "Per-day worked time over recent workdays.",
  loading: "Loading workdays…",
  render: `
    var TARGET = ${EIGHT_HOURS};
    function render(d) {
      var days = Array.isArray(d) ? d : ((d && d.summaries) || []);
      var html = '<div class="card"><div class="head">';
      html += '<span class="title">Recent workdays</span>';
      html += '<span class="sub">' + days.length + " days</span></div>";
      if (days.length === 0) {
        html += '<div class="empty">No recent workdays.</div></div>';
        root.innerHTML = html;
        return;
      }
      html += '<div class="body">';
      for (var i = 0; i < days.length; i++) {
        var w = days[i] || {};
        var secs = (w.totals && w.totals.workSeconds) || 0;
        var pct = Math.max(0, Math.min(100, Math.round((secs / TARGET) * 100)));
        var iso = w.startedAt || (w.date ? w.date + "T00:00:00" : null);
        var day = iso ? fmtWeekday(iso) : (w.date || "");
        var date = iso ? fmtDate(iso) : "";
        html += '<div class="wd"><div class="wd-label">';
        html += '<div class="wd-day">' + esc(day) + "</div>";
        html += '<div class="wd-date">' + esc(date) + "</div></div>";
        html += '<div class="wd-bar"><div class="fill" data-pct="' + pct + '"></div></div>';
        html += '<div class="wd-total">' + fmtDur(secs) + "</div></div>";
      }
      html += "</div></div>";
      root.innerHTML = html;
    }
  `,
})
