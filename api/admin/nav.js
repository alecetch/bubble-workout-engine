(function () {
  const NAV_GROUPS = [
    {
      label: "Engine",
      items: [
        { label: "Exercises",           href: "/admin/exercises" },
        { label: "Rep Rules",           href: "/admin/rep-rules" },
        { label: "Narration",           href: "/admin/narration" },
        { label: "Progression Sandbox", href: "/admin/progression-sandbox" },
        { label: "Preview",             href: "/admin/preview" },
      ],
    },
    {
      label: "Quality",
      items: [
        { label: "Coverage",        href: "/admin/coverage" },
        { label: "Health",          href: "/admin/health" },
        { label: "Observability",   href: "/admin/observability" },
        { label: "Program Quality", href: "/admin/program-quality" },
        { label: "Seed History",    href: "/admin/seed-history" },
      ],
    },
    {
      label: "People",
      items: [
        { label: "Users",        href: "/admin/users" },
        { label: "Coaches",      href: "/admin/coaches" },
        { label: "Coach Portal", href: "/admin/coach-portal" },
      ],
    },
    {
      label: "Content",
      items: [
        { label: "HYROX",              href: "/admin/hyrox" },
        { label: "HYROX Test Harness", href: "/admin/hyrox-test-harness" },
        { label: "HYROX Results Scraper", href: "/admin/hyrox-results" },
        { label: "Content Studio",     href: "/admin/content-studio" },
        { label: "Config Editor",      href: "/admin-ui/index.html" },
      ],
    },
    {
      label: "Dev Tools",
      items: [
        { label: "Website \u2197",          href: "http://127.0.0.1:3000/",                       target: "_blank" },
        { label: "Mailpit \u2197",          href: "http://localhost:8025",                         target: "_blank" },
        { label: "Doc Board \u2197",        href: "http://localhost:3001",                         target: "_blank" },
        { label: "HYROX Calc \u2197",       href: "http://localhost:5173/hyrox-calculator",        target: "_blank" },
        { label: "HYROX Predictor \u2197",  href: "http://localhost:5173/hyrox-predictor",         target: "_blank" },
        { label: "Running Profiler \u2197", href: "http://localhost:5173/running-profiler",        target: "_blank" },
      ],
    },
  ];

  const currentPath = window.location.pathname.split("?")[0];

  function isActive(href) {
    if (!href.startsWith("/")) return false;
    return currentPath === href || currentPath === href + "/";
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = [
      "#admin-nav{position:fixed;left:0;top:0;bottom:0;width:190px;background:#1b1f2a;color:#c8cfd9;overflow-y:auto;z-index:200;padding:12px 0;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.4}",
      "#admin-nav .nav-logo{padding:8px 16px 14px;font-size:14px;font-weight:700;color:#fff;letter-spacing:.3px}",
      "#admin-nav .nav-group-label{padding:12px 16px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280}",
      "#admin-nav a{display:block;padding:5px 16px;color:#c8cfd9;text-decoration:none;border-left:3px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#admin-nav a:hover{background:rgba(255,255,255,.06);color:#fff}",
      "#admin-nav a.active{color:#fff;background:rgba(15,98,254,.18);border-left-color:#0f62fe;font-weight:600}",
      "#admin-nav .nav-sep{border:0;border-top:1px solid #2e3447;margin:8px 0}",
      "body{padding-left:190px!important}",
    ].join("");
    document.head.appendChild(style);
  }

  function render() {
    injectStyles();

    let html = '<div class="nav-logo">Admin</div>';
    NAV_GROUPS.forEach(function (group, i) {
      if (i > 0) html += '<hr class="nav-sep">';
      html += '<div class="nav-group-label">' + group.label + "</div>";
      group.items.forEach(function (item) {
        const active = isActive(item.href) ? " active" : "";
        const target = item.target ? ' target="' + item.target + '"' : "";
        html += '<a href="' + item.href + '"' + target + ' class="' + active.trim() + '">' + item.label + "</a>";
      });
    });

    const nav = document.createElement("nav");
    nav.id = "admin-nav";
    nav.innerHTML = html;

    const placeholder = document.getElementById("nav-placeholder");
    if (placeholder) {
      placeholder.parentNode.insertBefore(nav, placeholder);
      placeholder.remove();
    } else {
      document.body.insertBefore(nav, document.body.firstChild);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
