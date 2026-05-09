import express from "express";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";

export const adminUsersRouter = express.Router();

// GET /admin/users — list all registered users (email-based only)
adminUsersRouter.get("/users", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.subject_id,
        u.created_at,
        u.subscription_status,
        u.trial_expires_at,
        u.subscription_expires_at,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (u.trial_expires_at - now())) / 86400))::int AS trial_days_remaining,
        cp.id          AS client_profile_id,
        cp.display_name,
        cp.onboarding_completed_at,
        cp.onboarding_step_completed,
        p.program_count
      FROM app_user u
      LEFT JOIN client_profile cp ON cp.user_id = u.id
      LEFT JOIN (
        SELECT client_profile_id, COUNT(*) AS program_count
        FROM program
        GROUP BY client_profile_id
      ) p ON p.client_profile_id = cp.id
      WHERE u.email IS NOT NULL
      ORDER BY u.created_at DESC
    `);
    return res.json({ ok: true, users: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminUsersRouter.patch("/users/:id/subscription", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ ok: false, error: "Invalid user id." });
  }

  const ALLOWED = ["trialing", "active", "expired", "cancelled"];
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${ALLOWED.join(", ")}` });
  }

  try {
    const result = await pool.query(
      status === "trialing"
        ? `UPDATE app_user
           SET subscription_status = 'trialing',
               trial_started_at = now(),
               trial_expires_at = now() + interval '14 days'
           WHERE id = $1 AND email IS NOT NULL
           RETURNING id, email, subscription_status, trial_expires_at`
        : `UPDATE app_user
           SET subscription_status = $2
           WHERE id = $1 AND email IS NOT NULL
           RETURNING id, email, subscription_status, trial_expires_at`,
      status === "trialing" ? [id] : [id, status],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found." });
    }

    return res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

// DELETE /admin/users/:id — hard-delete a user and all cascade data
adminUsersRouter.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  // Basic UUID format guard
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ ok: false, error: "Invalid user id." });
  }
  try {
    const result = await pool.query(
      "DELETE FROM app_user WHERE id = $1 AND email IS NOT NULL RETURNING id, email",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found." });
    }
    return res.json({ ok: true, deleted: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
