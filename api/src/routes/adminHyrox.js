import express from "express";
import { pool } from "../db.js";

export const adminHyroxRouter = express.Router();

adminHyroxRouter.get("/hyrox/submissions", async (req, res) => {
  const rawEmail = String(req.query.email ?? "").trim();
  const rawLimit = req.query.limit;
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(rawLimit ?? ""), 10) || 100));

  try {
    const params = [];
    let where = "";

    if (rawEmail) {
      params.push(`%${rawEmail}%`);
      where = `WHERE s.email ILIKE $1`;
    }

    params.push(safeLimit);

    const result = await pool.query(
      `SELECT
        s.id              AS submission_id,
        s.email,
        s.display_name,
        s.division,
        s.finish_time_seconds,
        s.race_name,
        s.race_date,
        s.created_at,
        EXISTS(
          SELECT 1 FROM hyrox_analyses a
          WHERE a.submission_id = s.id AND a.carousel_a_json IS NOT NULL
        ) AS has_carousel
      FROM hyrox_submissions s
      ${where}
      ORDER BY s.created_at DESC
      LIMIT $${params.length}`,
      params,
    );

    return res.json({ ok: true, submissions: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
