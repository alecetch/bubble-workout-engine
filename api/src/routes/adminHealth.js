import express from "express";
import { pool } from "../db.js";
import { fetchCatalogueRuleHealthReport } from "../services/catalogueRuleHealth.js";
import { publicInternalError } from "../utils/publicError.js";

export const adminHealthRouter = express.Router();

export function createAdminHealthReportHandler({ buildReport = fetchCatalogueRuleHealthReport, db = pool } = {}) {
  return async function adminHealthReportHandler(_req, res) {
    try {
      const report = await buildReport(db);
      return res.json({ ok: true, report });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: publicInternalError(err),
      });
    }
  };
}

adminHealthRouter.get("/report", createAdminHealthReportHandler());
