import logger from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startMs = Date.now();

  req.log = logger.child({ request_id: req.request_id });

  req.log.debug({
    event: "http.request.start",
    method: req.method,
    url: req.url,
  });

  res.on("finish", () => {
    const duration_ms = Date.now() - startMs;
    const status_code = res.statusCode;
    const level = status_code >= 500 ? "error" : status_code >= 400 ? "warn" : "info";

    req.log[level]({
      event: "http.request.finish",
      method: req.method,
      url: req.url,
      status_code,
      duration_ms,
    });
  });

  next();
}
