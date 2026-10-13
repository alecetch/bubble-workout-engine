import express from "express";
import multer from "multer";
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { auditLog } from "../utils/auditLog.js";
import { displayLabel } from "../utils/displayLabels.js";
import { resolveMediaUrl } from "../utils/mediaUrl.js";
import { publicInternalError } from "../utils/publicError.js";
import { EXERCISE_MEDIA_BUCKET, getObject, headObject, putObject } from "../services/s3Service.js";
import { promoteHeroMediaRow } from "../services/heroMediaPromotion.js";

const here = dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = join(here, "../../assets/media-assets");
const SCOPES = new Set(["program", "program_day"]);
const IMPORT_IMAGE_KEY = /^hero-media\/(program|program_day)\/[a-z0-9_-]+\.(png|jpg|webp)$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function camel(row) {
  return {
    id: row.id, assetKey: row.asset_key, usageScope: row.usage_scope,
    dayType: row.day_type, dayTypeLabel: displayLabel("programType", row.day_type),
    focusType: row.focus_type, focusTypeLabel: displayLabel("dayFocus", row.focus_type),
    label: row.label, sortOrder: row.sort_order, isActive: row.is_active,
    imageKey: row.image_key, imageUrl: resolveMediaUrl(row), promotedAt: row.promoted_at,
    updatedAt: row.updated_at,
    changedSincePromotion: !row.promoted_at || new Date(row.updated_at) > new Date(row.promoted_at),
  };
}

function legacyFiles(dir) {
  const exact = new Set();
  for (const scope of ["program", "program_day"]) {
    // Per scope, so one missing directory doesn't make the other scope's files look missing too.
    try {
      for (const file of readdirSync(join(dir, scope))) exact.add(`${scope}/${file}`);
    } catch { /* unavailable directory: its files are represented as missing */ }
  }
  const folded = new Set([...exact].map(v => v.toLowerCase()));
  return { exact, folded };
}

async function statusForKey(key, headObjectFn, legacyDir) {
  if (!key) return "missing";
  if (key.startsWith("hero-media/")) {
    try { await headObjectFn(key, EXERCISE_MEDIA_BUCKET); return "found"; }
    catch (err) {
      if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return "missing";
      return "missing";
    }
  }
  const { exact, folded } = legacyFiles(legacyDir);
  return exact.has(key) ? "found" : folded.has(key.toLowerCase()) ? "case_mismatch" : "missing";
}

function selectCell(rows, type, focus, scope) {
  const scoped = rows.filter(r => r.usage_scope === scope && r.is_active);
  const pick = (day, f) => scoped.find(r => r.day_type === day && r.focus_type === f);
  let row;
  if (scope === "program") {
    row = pick(type, null);
    if (row) return { row, method: "exact" };
  } else {
    row = pick(type, focus);
    if (row) return { row, method: "exact" };
    row = pick(type, "full_body");
    if (row) return { row, method: "type_full_body" };
    row = pick(type, null);
    if (row) return { row, method: "type_default" };
    row = scoped.find(r => r.day_type === type);
    if (row) return { row, method: "type_any" };
  }
  row = scoped.find(r => r.day_type === "generic" && (r.focus_type === focus || r.focus_type == null))
    || scoped.find(r => r.day_type === "generic");
  return row ? { row, method: "generic" } : { row: null, method: "none" };
}

function slug(value) {
  return String(value || "image").toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

function parseBool(value) { return value === true || value === "true" || value === "1"; }

export function createAdminHeroMediaRouter({
  db = pool, putObjectFn = putObject, getObjectFn = getObject, headObjectFn = headObject,
  fetchFn = (...args) => fetch(...args), auditLogFn = auditLog, legacyAssetsDir = LEGACY_DIR,
  promotionConfig,
} = {}) {
  const router = express.Router();
  const listRows = () => db.query("SELECT * FROM media_assets ORDER BY usage_scope, sort_order, asset_key");
  const types = async () => (await db.query("SELECT DISTINCT program_type FROM program_generation_config ORDER BY program_type")).rows.map(r => r.program_type);
  const find = async id => (await db.query("SELECT * FROM media_assets WHERE id = $1", [id])).rows[0];
  const audit = (req, action, row, detail) => auditLogFn(req, { action: `hero_media.${action}`, entity: "hero_media", entityId: String(row?.id ?? ""), detail });

  router.get("/hero-media/list", async (_req, res) => {
    try {
      const rows = (await listRows()).rows;
      const output = await Promise.all(rows.map(async row => ({ ...camel(row), fileStatus: await statusForKey(row.image_key, headObjectFn, legacyAssetsDir) })));
      res.json({ ok: true, rows: output });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });

  router.get("/hero-media/coverage", async (_req, res) => {
    try {
      const rows = (await listRows()).rows;
      const programTypes = await types();
      const focuses = [...new Set(["upper_body", "lower_body", "full_body", ...rows.map(r => r.focus_type).filter(Boolean)])];
      const matrix = programTypes.map(programType => ({
        programType, programTypeLabel: displayLabel("programType", programType),
        program: (() => { const c = selectCell(rows, programType, null, "program"); return { method: c.method, row: c.row ? camel(c.row) : null }; })(),
        focuses: focuses.map(focusType => { const c = selectCell(rows, programType, focusType, "program_day"); return { focusType, focusTypeLabel: displayLabel("dayFocus", focusType), method: c.method, row: c.row ? camel(c.row) : null }; }),
      }));
      res.json({ ok: true, programTypes, focuses, matrix });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });

  router.post("/hero-media", express.json(), async (req, res) => {
    try {
      const b = req.body || {};
      if (!SCOPES.has(b.usageScope)) return res.status(400).json({ ok: false, error: "Unknown usage scope" });
      const known = await types();
      if (b.dayType !== "generic" && !known.includes(b.dayType)) return res.status(400).json({ ok: false, error: "Unknown program type" });
      if (b.usageScope === "program" && b.focusType) return res.status(400).json({ ok: false, error: "Program mappings cannot have a focus" });
      if (b.focusType != null && !/^[a-z0-9_]+$/.test(b.focusType)) return res.status(400).json({ ok: false, error: "Invalid focus" });
      if (await statusForKey(b.imageKey, headObjectFn, legacyAssetsDir) !== "found") return res.status(400).json({ ok: false, error: "Image was not found" });
      const assetKey = `${b.usageScope}:${b.dayType || ""}:${b.focusType || ""}:${b.imageKey}`;
      const q = await db.query(`INSERT INTO media_assets
        (asset_key, usage_scope, day_type, focus_type, label, sort_order, is_active, image_key, image_url)
        VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8) RETURNING *`,
      [assetKey, b.usageScope, b.dayType, b.focusType || null, b.label || "", Number(b.sortOrder) || 0, b.imageKey, b.imageUrl || ""]);
      await audit(req, "create", q.rows[0], { assetKey });
      res.status(201).json({ ok: true, row: camel(q.rows[0]) });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });

  router.patch("/hero-media/:id", express.json(), async (req, res) => {
    const map = { usageScope: "usage_scope", dayType: "day_type", focusType: "focus_type", label: "label", sortOrder: "sort_order", imageKey: "image_key", imageUrl: "image_url", isActive: "is_active" };
    const entries = Object.entries(map).filter(([key]) => Object.hasOwn(req.body || {}, key));
    if (!entries.length) return res.status(400).json({ ok: false, error: "No fields to update" });
    try {
      if (req.body.usageScope !== undefined && !SCOPES.has(req.body.usageScope)) return res.status(400).json({ ok: false, error: "Unknown usage scope" });
      if (req.body.imageKey !== undefined && await statusForKey(req.body.imageKey, headObjectFn, legacyAssetsDir) !== "found") return res.status(400).json({ ok: false, error: "Image was not found" });
      const params = entries.map(([key]) => req.body[key] === "" && key === "focusType" ? null : req.body[key]);
      params.push(req.params.id);
      const set = entries.map(([, col], i) => `${col} = $${i + 1}`).join(", ");
      const q = await db.query(`UPDATE media_assets SET ${set}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
      if (!q.rows[0]) return res.status(404).json({ ok: false, error: "Mapping not found" });
      await audit(req, "update", q.rows[0], { fields: entries.map(([k]) => k) });
      res.json({ ok: true, row: camel(q.rows[0]) });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });

  const receiveImage = (req, res, next) => upload.single("image")(req, res, err => err ? res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ ok: false, error: err.code === "LIMIT_FILE_SIZE" ? "Image exceeds 5 MB" : err.message }) : next());
  router.post("/hero-media/:id/image", receiveImage, async (req, res) => {
    try {
      const row = await find(req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: "Mapping not found" });
      if (!req.file || !["image/png", "image/jpeg", "image/webp"].includes(req.file.mimetype)) return res.status(400).json({ ok: false, error: "Use a PNG, JPEG or WebP image" });
      const meta = await sharp(req.file.buffer).metadata();
      if (!meta.width || meta.width < 1080) return res.status(400).json({ ok: false, error: "Image width must be at least 1080 px" });
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const key = `hero-media/${row.usage_scope}/${slug(req.body?.label || row.label || req.file.originalname)}.${ext}`;
      await putObjectFn(key, req.file.buffer, req.file.mimetype, EXERCISE_MEDIA_BUCKET);
      const q = await db.query("UPDATE media_assets SET image_key = $1, image_url = '', updated_at = now() WHERE id = $2 RETURNING *", [key, row.id]);
      await audit(req, "upload", q.rows[0], { imageKey: key });
      res.json({ ok: true, row: camel(q.rows[0]) });
    } catch (err) { res.status(400).json({ ok: false, error: err?.message || "Invalid image" }); }
  });

  router.delete("/hero-media/:id", async (req, res) => mutateActive(req, res, false, "deactivate"));
  router.post("/hero-media/:id/restore", async (req, res) => mutateActive(req, res, true, "restore"));
  async function mutateActive(req, res, active, action) {
    try {
      const q = await db.query("UPDATE media_assets SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *", [active, req.params.id]);
      if (!q.rows[0]) return res.status(404).json({ ok: false, error: "Mapping not found" });
      await audit(req, action, q.rows[0]); res.json({ ok: true, row: camel(q.rows[0]) });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  }

  async function promote(req, row) {
    const result = await promoteHeroMediaRow(row, { db, getObjectFn, fetchFn, ...(promotionConfig ? { config: promotionConfig } : {}) });
    if (result.ok) await audit(req, "promote", row, { assetKey: row.asset_key });
    return result;
  }
  router.post("/hero-media/:id/promote", async (req, res) => {
    try { const row = await find(req.params.id); if (!row) return res.status(404).json({ ok: false, error: "Mapping not found" }); const result = await promote(req, row); res.status(result.ok ? 200 : 503).json(result); }
    catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });
  router.post("/hero-media/promote-all", async (req, res) => {
    try { const rows = (await listRows()).rows.filter(r => r.is_active); const results = []; for (const row of rows) results.push(await promote(req, row)); res.status(results.every(r => r.ok) ? 200 : 207).json({ ok: results.every(r => r.ok), results }); }
    catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });

  router.post("/hero-media/import", receiveImage, async (req, res) => {
    try {
      const b = req.body || {}; if (!b.asset_key || !SCOPES.has(b.usage_scope)) return res.status(400).json({ ok: false, error: "Invalid import" });
      // An uploaded image is written to the bucket at the posted key, so only accept keys in the
      // shape the upload route generates.
      if (req.file && !IMPORT_IMAGE_KEY.test(String(b.image_key || ""))) return res.status(400).json({ ok: false, error: "Invalid image key" });
      if (req.file) await putObjectFn(b.image_key, req.file.buffer, req.file.mimetype, EXERCISE_MEDIA_BUCKET);
      const q = await db.query(`INSERT INTO media_assets (asset_key,usage_scope,day_type,focus_type,label,sort_order,is_active,image_key,image_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (asset_key) DO UPDATE SET
        usage_scope=EXCLUDED.usage_scope,day_type=EXCLUDED.day_type,focus_type=EXCLUDED.focus_type,label=EXCLUDED.label,
        sort_order=EXCLUDED.sort_order,is_active=EXCLUDED.is_active,image_key=EXCLUDED.image_key,image_url=EXCLUDED.image_url,updated_at=now() RETURNING *`,
      [b.asset_key,b.usage_scope,b.day_type||null,b.focus_type||null,b.label||"",Number(b.sort_order)||0,parseBool(b.is_active),b.image_key,b.image_url||""]);
      await audit(req, "import", q.rows[0], { assetKey: b.asset_key }); res.json({ ok: true, row: camel(q.rows[0]) });
    } catch (err) { res.status(500).json({ ok: false, error: publicInternalError(err) }); }
  });
  return router;
}

export const adminHeroMediaRouter = createAdminHeroMediaRouter();
export { selectCell, statusForKey };
