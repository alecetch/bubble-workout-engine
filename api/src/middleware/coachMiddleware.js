import { pool } from "../db.js";
import { requireUuid, safeString } from "../utils/validate.js";

export function createCoachMiddleware(db = pool) {
  async function requireCoachRole(req, res, next) {
    try {
      const userId = safeString(req.auth?.user_id);
      requireUuid(userId, "user_id");

      const { rows } = await db.query(
        `SELECT role
         FROM app_user
         WHERE id = $1
         LIMIT 1`,
        [userId],
      );

      if (!rows.length || rows[0].role !== "coach") {
        return res.status(403).json({
          ok: false,
          code: "forbidden_not_coach",
          error: "Coach role required.",
        });
      }

      req.auth.role = rows[0].role;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  async function requireCoachClientAccess(req, res, next) {
    try {
      const coachUserId = safeString(req.auth?.user_id);
      const clientUserId = requireUuid(req.params?.client_user_id, "client_user_id");

      const { rows } = await db.query(
        `SELECT id
         FROM coach_client
         WHERE coach_user_id = $1
           AND client_user_id = $2
           AND status = 'active'
         LIMIT 1`,
        [coachUserId, clientUserId],
      );

      if (!rows.length) {
        return res.status(403).json({
          ok: false,
          code: "forbidden_no_relationship",
          error: "No active coach-client relationship.",
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  }

  return { requireCoachRole, requireCoachClientAccess };
}

const defaultCoachMiddleware = createCoachMiddleware();

export const requireCoachRole = defaultCoachMiddleware.requireCoachRole;
export const requireCoachClientAccess = defaultCoachMiddleware.requireCoachClientAccess;
