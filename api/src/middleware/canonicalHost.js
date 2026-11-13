function hostname(value) {
  return String(value ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function canonicalHost(req, res, next) {
  const canonical = hostname(process.env.CANONICAL_HOST);
  if (!canonical || !["GET", "HEAD"].includes(req.method)) return next();

  const path = req.path;
  if (path.startsWith("/.well-known/") || path.startsWith("/health")
    || path === "/api" || path.startsWith("/api/") || path.startsWith("/admin")) return next();

  const host = hostname(req.hostname || req.get("host"));
  if (host === canonical) return next();
  const redirectHosts = new Set([
    "getforma.fit", "www.getforma.fit", `www.${canonical}`,
    ...(process.env.REDIRECT_HOSTS ?? "").split(",").map(hostname).filter(Boolean),
  ]);
  if (!redirectHosts.has(host)) return next();
  return res.redirect(301, `https://${canonical}${req.originalUrl}`);
}
