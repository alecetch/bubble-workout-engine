import express from "express";
import { pool } from "../db.js";
import { getYearProgress } from "../services/yearProgress.js";
import { isValidTimezone } from "../utils/timezone.js";
import { publicInternalError } from "../utils/publicError.js";
import { getYearRecap } from "../services/yearRecap.js";

export function createYearProgressHandler(db = pool, { now = () => new Date() } = {}) {
  return async (req, res) => {
    if (!req.auth?.user_id) return res.status(401).json({ ok: false, code: "unauthorized" });
    const { year, timezone } = req.query;
    if (timezone !== undefined && !isValidTimezone(timezone)) return res.status(400).json({ ok: false, code: "invalid_timezone" });
    if (year !== undefined && (typeof year !== "string" || !/^\d{4}$/.test(year))) return res.status(400).json({ ok: false, code: "invalid_year" });
    try {
      const progress = await getYearProgress(db, req.auth.user_id, { year: year === undefined ? undefined : Number(year), timeZone: timezone, now: now() });
      return progress ? res.json(progress) : res.status(404).json({ ok: false, code: "not_found" });
    } catch (err) {
      return res.status(err.status ?? 500).json({ ok: false, code: err.code ?? "internal_error", error: err.status ? err.message : publicInternalError(err) });
    }
  };
}

export const yearProgressRouter = express.Router();
yearProgressRouter.get("/users/me/year-progress", createYearProgressHandler());

export function createYearRecapHandler(db = pool, { now = () => new Date() } = {}) {
  return async (req, res) => {
    if (!req.auth?.user_id) return res.status(401).json({ ok: false, code: "unauthorized" });
    const { year, timezone } = req.query;
    if (timezone !== undefined && !isValidTimezone(timezone)) return res.status(400).json({ ok: false, code: "invalid_timezone" });
    if (year !== undefined && (typeof year !== "string" || !/^\d{4}$/.test(year))) return res.status(400).json({ ok: false, code: "invalid_year" });
    try {
      return res.json(await getYearRecap(db, req.auth.user_id, { year: year === undefined ? undefined : Number(year), timeZone: timezone, now: now() }));
    } catch (err) {
      return res.status(err.status ?? 500).json({ ok: false, code: err.status ? err.code : "internal_error", error: err.status ? err.message : publicInternalError(err) });
    }
  };
}
yearProgressRouter.get("/users/me/year-recap", createYearRecapHandler());
