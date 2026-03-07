// api/src/middleware/requestId.js
import { randomUUID } from "node:crypto";

/**
 * requestId — must be the first app.use() in server.js.
 *
 * Sets req.request_id from the inbound X-Request-Id header, or generates a
 * new UUID if the header is absent. Echoes the value back as X-Request-Id on
 * the response so callers can correlate logs end-to-end.
 */
export function requestId(req, res, next) {
  req.request_id = (req.headers["x-request-id"] || "").toString().trim() || randomUUID();
  res.setHeader("X-Request-Id", req.request_id);
  next();
}
