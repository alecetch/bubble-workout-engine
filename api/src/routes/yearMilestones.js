import express from "express";
import { pool } from "../db.js";
import { claimYearMilestone } from "../services/yearMilestones.js";
import { publicInternalError } from "../utils/publicError.js";

export function createYearMilestoneHandlers(db = pool) {
  return {
    seen: async (req, res) => {
      if (!req.auth?.user_id) return res.status(401).json({ ok: false, code: "unauthorized" });
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(404).json({ ok: false, code: "not_found" });
      try {
        const result = await db.query(`UPDATE year_milestone SET seen_at = COALESCE(seen_at, now())
          WHERE user_id = $1 AND id = $2 RETURNING id`, [req.auth.user_id, req.params.id]);
        return result.rows.length ? res.status(204).end() : res.status(404).json({ ok: false, code: "not_found" });
      } catch (err) { return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) }); }
    },
    claim: async (req, res) => {
      if (!req.auth?.user_id) return res.status(401).json({ ok: false, code: "unauthorized" });
      const year = req.body?.year;
      if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear() + 1) return res.status(400).json({ ok: false, code: "invalid_year" });
      try { return res.json(await claimYearMilestone(db, req.auth.user_id, year)); }
      catch (err) { return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) }); }
    },
  };
}

export const yearMilestonesRouter = express.Router();
const handlers = createYearMilestoneHandlers();
yearMilestonesRouter.post("/users/me/year-milestones/claim", handlers.claim);
yearMilestonesRouter.post("/users/me/year-milestones/:id/seen", handlers.seen);
