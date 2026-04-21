import express from "express";
import { pool } from "../db.js";
import { adminOnly } from "../middleware/chains.js";
import { requireEnum, requireUuid, safeString } from "../utils/validate.js";

const ALLOWED_ROLES = ["athlete", "coach", "admin"];

function isUniqueViolation(err) {
  return err?.code === "23505";
}

export function createAdminCoachesHandlers(db = pool) {
  async function listCoaches(_req, res, next) {
    try {
      const { rows } = await db.query(
        `
        SELECT
          u.id,
          u.email,
          u.role,
          u.created_at,
          COUNT(cc.id) FILTER (WHERE cc.status = 'active')::int AS active_client_count
        FROM app_user u
        LEFT JOIN coach_client cc
          ON cc.coach_user_id = u.id
        WHERE u.role = 'coach'
        GROUP BY u.id
        ORDER BY u.created_at DESC
        `,
      );
      return res.json({ ok: true, coaches: rows });
    } catch (err) {
      return next(err);
    }
  }

  async function patchUserRole(req, res, next) {
    try {
      const userId = requireUuid(req.params.user_id, "user_id");
      const role = requireEnum(req.body?.role, "role", ALLOWED_ROLES);

      const { rows } = await db.query(
        `UPDATE app_user
         SET role = $1,
             updated_at = now()
         WHERE id = $2
         RETURNING id, email, role`,
        [role, userId],
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "User not found." });
      }

      return res.json({ ok: true, user: rows[0] });
    } catch (err) {
      if (err?.name === "RequestValidationError" && safeString(err.message).includes("role")) {
        return res.status(400).json({ ok: false, error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
      }
      return next(err);
    }
  }

  async function linkCoachClient(req, res, next) {
    try {
      const coachUserId = requireUuid(req.params.coach_user_id, "coach_user_id");
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");

      const coachR = await db.query(
        `SELECT role
         FROM app_user
         WHERE id = $1
         LIMIT 1`,
        [coachUserId],
      );

      if (!coachR.rows.length || coachR.rows[0].role !== "coach") {
        return res.status(400).json({ ok: false, error: "Target user does not have coach role." });
      }

      try {
        const { rows } = await db.query(
          `INSERT INTO coach_client (
             coach_user_id,
             client_user_id,
             status,
             accepted_at,
             invited_by_user_id,
             updated_at
           )
           VALUES ($1, $2, 'active', now(), NULL, now())
           RETURNING id, status`,
          [coachUserId, clientUserId],
        );
        return res.status(201).json({ ok: true, relationship: rows[0] });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return res.status(409).json({ ok: false, error: "An active or pending relationship already exists." });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  }

  async function revokeCoachClient(req, res, next) {
    try {
      const coachUserId = requireUuid(req.params.coach_user_id, "coach_user_id");
      const clientUserId = requireUuid(req.params.client_user_id, "client_user_id");

      const { rows } = await db.query(
        `UPDATE coach_client
         SET status = 'revoked',
             revoked_at = now(),
             updated_at = now()
         WHERE coach_user_id = $1
           AND client_user_id = $2
           AND status IN ('active', 'pending')
         RETURNING id`,
        [coachUserId, clientUserId],
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "No active relationship found to revoke." });
      }

      return res.json({ ok: true, revoked: rows[0].id });
    } catch (err) {
      return next(err);
    }
  }

  async function listRelationships(_req, res, next) {
    try {
      const { rows } = await db.query(
        `SELECT
           cc.id,
           cc.coach_user_id,
           coach.email AS coach_email,
           cc.client_user_id,
           client.email AS client_email,
           cc.status,
           cc.created_at,
           cc.accepted_at,
           cc.revoked_at
         FROM coach_client cc
         JOIN app_user coach ON coach.id = cc.coach_user_id
         JOIN app_user client ON client.id = cc.client_user_id
         ORDER BY cc.created_at DESC`,
      );
      return res.json({ ok: true, relationships: rows });
    } catch (err) {
      return next(err);
    }
  }

  async function coachActivity(req, res, next) {
    try {
      const coachUserId = requireUuid(req.params.coach_user_id, "coach_user_id");

      const { rows } = await db.query(
        `SELECT
           cpo.id,
           cpo.client_user_id,
           cpo.exercise_id,
           cpo.override_kind,
           cpo.status,
           cpo.reason_text,
           cpo.created_at,
           cpo.consumed_at
         FROM coach_progression_override cpo
         WHERE cpo.coach_user_id = $1
         ORDER BY cpo.created_at DESC
         LIMIT 100`,
        [coachUserId],
      );

      return res.json({ ok: true, overrides: rows });
    } catch (err) {
      return next(err);
    }
  }

  return {
    listCoaches,
    patchUserRole,
    linkCoachClient,
    revokeCoachClient,
    listRelationships,
    coachActivity,
  };
}

export const adminCoachesRouter = express.Router();
const handlers = createAdminCoachesHandlers();

adminCoachesRouter.get("/coaches", adminOnly, handlers.listCoaches);
adminCoachesRouter.get("/coach-clients", adminOnly, handlers.listRelationships);
adminCoachesRouter.patch("/users/:user_id/role", adminOnly, handlers.patchUserRole);
adminCoachesRouter.post(
  "/coaches/:coach_user_id/clients/:client_user_id/link",
  adminOnly,
  handlers.linkCoachClient,
);
adminCoachesRouter.delete(
  "/coaches/:coach_user_id/clients/:client_user_id/link",
  adminOnly,
  handlers.revokeCoachClient,
);
adminCoachesRouter.get(
  "/coaches/:coach_user_id/activity",
  adminOnly,
  handlers.coachActivity,
);
