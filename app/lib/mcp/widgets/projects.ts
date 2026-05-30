import { defineWidget } from "./runtime"

// ---------------------------------------------------------------------------
// projects — list_projects card
// ---------------------------------------------------------------------------
// The tool returns a flat array of { id, name }. Render it as a tidy list with
// the id as a monospace tag, matching the landing ProjectsCard.

export const projectsWidget = defineWidget({
  name: "clockin-projects",
  uri: "ui://clockin/projects.html",
  title: "Projects",
  description: "List of projects you can log time to.",
  loading: "Loading projects…",
  render: `
    function render(d) {
      var list = Array.isArray(d) ? d : ((d && d.projects) || []);
      var html = '<div class="card"><div class="head">';
      html += '<span class="title">Projects</span>';
      html += '<span class="sub">' + list.length + " found</span></div>";
      if (list.length === 0) {
        html += '<div class="empty">No projects found.</div></div>';
        root.innerHTML = html;
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var p = list[i] || {};
        html += '<div class="item"><span class="name">' + esc(p.name) + "</span>";
        html += '<span class="id">#' + esc(p.id) + "</span></div>";
      }
      html += "</div>";
      root.innerHTML = html;
    }
  `,
})
