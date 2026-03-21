import { pool } from "../db.js";
import logger from "./logger.js";

function requestIp(req) {
  // req.ip is populated by Express from the last x-forwarded-for entry when
  // "trust proxy" is set — this is the real client IP from Fly.io's load balancer.
  // Never read the raw x-forwarded-for header directly: it is attacker-controlled.
  return req?.ip || req?.socket?.remoteAddress || null;
}

export async function auditLog(req, { action, entity, entityId = null, detail = null } = {}) {
  if (!action || !entity) return;

  try {
    await pool.query(
      `INSERT INTO admin_audit_log (action, entity, entity_id, detail, ip)
       VALUES ($1, $2, $3, COALESCE($4::jsonb, '{}'::jsonb), $5)`,
      [
        action,
        entity,
        entityId,
        detail == null ? null : JSON.stringify(detail),
        requestIp(req),
      ],
    );
  } catch (err) {
    logger.warn({ event: "audit.write.error", err: err?.message }, "Admin audit log write failed (non-fatal)");
  }
}
