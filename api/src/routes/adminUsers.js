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
