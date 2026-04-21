import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";
import { makeTrainingHistoryImportService } from "../services/trainingHistoryImportService.js";

export const trainingHistoryImportRouter = express.Router();

const SUPPORTED_SOURCES = ["hevy"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter(_req, file, cb) {
    if (
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/octet-stream" ||
      file.originalname?.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
      return;
    }
    cb(Object.assign(new Error("Only CSV files are supported."), { code: "unsupported_file_type" }));
  },
});

function uploadSingle(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ ok: false, code: "file_too_large", error: "CSV file is too large." });
      return;
    }
    if (err.code === "unsupported_file_type") {
      res.status(400).json({ ok: false, code: "unsupported_file_type", error: err.message });
      return;
    }
    next(err);
  });
}

trainingHistoryImportRouter.post(
  "/training-history",
  ...userAuth,
  uploadSingle,
  async (req, res, next) => {
    try {
      const userId = req.auth.user_id;
      const sourceApp = String(req.body?.source_app ?? "").trim().toLowerCase();

      if (!SUPPORTED_SOURCES.includes(sourceApp)) {
        return res.status(400).json({
          ok: false,
          code: "unsupported_source_app",
          error: `source_app must be one of: ${SUPPORTED_SOURCES.join(", ")}`,
        });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, code: "missing_file", error: "A CSV file is required." });
      }

      const profileR = await pool.query(
        `SELECT id
         FROM client_profile
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      );
      const clientProfileId = profileR.rows[0]?.id ?? null;

      const importService = makeTrainingHistoryImportService(pool);
      const result = await importService.processHevyCsv({
        csvBuffer: req.file.buffer,
        userId,
        clientProfileId,
      });

      const statusCode = result.status === "failed" ? 422 : 200;
      return res.status(statusCode).json({ ok: result.status !== "failed", ...result });
    } catch (err) {
      if (err.code === "csv_parse_error") {
        return res.status(400).json({ ok: false, code: "csv_parse_error", error: err.message });
      }
      return next(err);
    }
  },
);

trainingHistoryImportRouter.get(
  "/training-history/:import_id",
  ...userAuth,
  async (req, res, next) => {
    try {
      const userId = req.auth.user_id;
      const importService = makeTrainingHistoryImportService(pool);
      const record = await importService.getImport(req.params.import_id, userId);
      if (!record) {
        return res.status(404).json({ ok: false, error: "Import not found." });
      }
      const summary = record.summary_json ?? {};
      return res.json({
        ok: true,
        import_id: record.id,
        status: record.status,
        source_app: record.source_app,
        row_count: summary.total_rows ?? 0,
        derived_anchor_count: summary.derived_anchors ?? 0,
        derived_anchor_lifts: summary.derived_anchor_lifts_snapshot ?? [],
        warnings: summary.warnings ?? [],
        imported_at: record.completed_at ?? record.created_at,
      });
    } catch (err) {
      return next(err);
    }
  },
);
