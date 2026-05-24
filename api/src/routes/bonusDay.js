import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { addBonusDay } from "../services/bonusDayService.js";

export const bonusDayRouter = express.Router();

function authUserId(req) {
  return String(req.auth?.user_id ?? req.auth?.userId ?? "").trim();
}

export function createBonusDayHandler({ db = pool, addBonusDayFn = addBonusDay } = {}) {
  return async function handleAddBonusDay(req, res) {
    const programId = String(req.params.programId ?? "").trim();
    const userId = authUserId(req);
    const { focusType, programType, scope, targetDate, weekday } = req.body ?? {};

    if (!programId || !userId) return res.status(400).json({ error: "Missing programId or auth" });
    if (!programType) return res.status(400).json({ error: "programType is required" });
    if (!scope || !["today", "weekday_recurring"].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'today' or 'weekday_recurring'" });
    }
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate))) {
      return res.status(400).json({ error: "targetDate must be YYYY-MM-DD" });
    }
    if (scope === "weekday_recurring" && !weekday) {
      return res.status(400).json({ error: "weekday is required for weekday_recurring scope" });
    }

    try {
      const result = await addBonusDayFn(db, {
        programId,
        userId,
        programType: String(programType).trim(),
        focusType: focusType ? String(focusType).trim() : null,
        targetDate: String(targetDate).trim(),
        scope,
        weekday: weekday ? String(weekday).trim().toLowerCase() : null,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      if (err?.status === 403) return res.status(403).json({ error: err.message });
      if (err?.status === 409) return res.status(409).json({ error: err.message });
      if (err?.status === 400) return res.status(400).json({ error: err.message });
      console.error("[bonusDay] error", err);
      return res.status(500).json({ error: "Failed to create bonus day" });
    }
  };
}

bonusDayRouter.post("/programs/:programId/bonus-day", requireAuth, createBonusDayHandler());
