import logger from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startMs = Date.now();
  const url = req.originalUrl ?? req.url;

  req.log = logger.child({ request_id: req.request_id });

  req.log.debug({
    event: "http.request.start",
    method: req.method,
    url,
  });

  res.on("finish", () => {
    const duration_ms = Date.now() - startMs;
    const status_code = res.statusCode;
    const level = status_code >= 500 ? "error" : status_code >= 400 ? "warn" : "info";

    const appFields = {};
    for (const field of ["platform", "version", "build"]) {
      const value = req.headers?.[`x-app-${field}`];
      if (value !== undefined) appFields[`app_${field}`] = String(value).slice(0, 32);
    }
    req.log[level]({
      event: "http.request.finish",
      method: req.method,
      url,
      status_code,
      duration_ms,
      ...appFields,
    });
  });

  next();
}
