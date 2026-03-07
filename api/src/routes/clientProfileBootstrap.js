// api/src/routes/clientProfileBootstrap.js
import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";

export const clientProfileBootstrapRouter = express.Router();

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.details = details;
  }
}

function s(v) {
  return (v ?? "").toString().trim();
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "")
    .replace(/^_+|_+$/g, "");
}

function parseListToSlugs(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((x) => normalizeSlug(x))
    .filter(Boolean);
  return [...new Set(values)];
}

function parseInjuryFlags(value) {
  const raw = String(value || "").trim();
  if (!raw || /no\s+known\s+issues/i.test(raw)) return [];
  return parseListToSlugs(raw);
}

function parsePreferredDays(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const map = new Map([
    ["mon", "mon"],
    ["monday", "mon"],
    ["tue", "tue"],
    ["tues", "tue"],
    ["tuesday", "tue"],
    ["wed", "wed"],
    ["weds", "wed"],
    ["wednesday", "wed"],
    ["thu", "thu"],
    ["thur", "thu"],
    ["thurs", "thu"],
    ["thursday", "thu"],
    ["fri", "fri"],
    ["friday", "fri"],
    ["sat", "sat"],
    ["saturday", "sat"],
    ["sun", "sun"],
    ["sunday", "sun"],
  ]);

  const out = [];
  for (const token of raw.split(",")) {
    const t = normalizeSlug(token);
    if (!t) continue;
    const flattened = t.replace(/_/g, "");
    const day = map.get(flattened) || map.get(t);
    if (day) out.push(day);
  }

  return [...new Set(out)];
}

function parseFitnessRank(slug) {
  switch (slug) {
    case "beginner":
      return 0;
    case "intermediate":
      return 1;
    case "advanced":
      return 2;
    case "elite":
      return 3;
    default:
      return 0;
  }
}

function toNullableText(value) {
  const t = String(value || "").trim();
  return t ? t : null;
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumeric(value) {
  const t = String(value || "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toBool(value, fallback = false) {
  const t = String(value || "").trim().toLowerCase();
  if (["true", "t", "1", "yes", "y"].includes(t)) return true;
  if (["false", "f", "0", "no", "n"].includes(t)) return false;
  return fallback;
}

function toTs(value) {
  const t = String(value || "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapError(err) {
  if (err instanceof ValidationError) {
    return { status: err.status ?? 400, code: "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    if (err.code === "23505") {
      return { status: 409, code: "unique_violation", message: "Unique constraint conflict" };
    }
    if (err.code === "23503") {
      return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    }
    if (err.code === "42P01") {
      return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
    }
  }
  return { status: 500, code: "internal_error", message: err?.message || "Internal server error" };
}

clientProfileBootstrapRouter.post("/client_profile/bootstrap", requireInternalToken, express.json({ limit: "1mb" }), async (req, res) => {
  const bubble_user_id = s(req.body?.bubble_user_id);
  const bubble_client_profile_id = s(req.body?.bubble_client_profile_id);

  try {
    if (!bubble_user_id) throw new ValidationError("Missing bubble_user_id");
    if (!bubble_client_profile_id) throw new ValidationError("Missing bubble_client_profile_id");

    const fitness_level_slug = normalizeSlug(req.body?.fitness_level || req.body?.fitness_level_slug || "");

    const payload = {
      display_name: s(req.body?.display_name || ""),
      fitness_level_slug,
      fitness_rank: parseFitnessRank(fitness_level_slug),
      equipment_items_slugs: Array.isArray(req.body?.equipment_items_slugs)
        ? req.body.equipment_items_slugs.map((x) => normalizeSlug(x)).filter(Boolean)
        : parseListToSlugs(req.body?.equipment_items_slugs_csv || ""),
      injury_flags: Array.isArray(req.body?.injury_flags)
        ? req.body.injury_flags.map((x) => normalizeSlug(x)).filter(Boolean)
        : parseInjuryFlags(req.body?.injury_flags || ""),
      preferred_days: Array.isArray(req.body?.preferred_days)
        ? req.body.preferred_days.map((x) => normalizeSlug(x)).filter(Boolean)
        : parsePreferredDays(req.body?.preferred_days || ""),
      main_goals_slugs: Array.isArray(req.body?.main_goals_slugs)
        ? req.body.main_goals_slugs.map((x) => normalizeSlug(x)).filter(Boolean)
        : parseListToSlugs(req.body?.main_goals || ""),
      minutes_per_session: Math.max(0, toInt(req.body?.minutes_per_session, 0)),
      height_cm: req.body?.height_cm == null || req.body?.height_cm === "" ? null : toInt(req.body?.height_cm, 0),
      weight_kg: toNumeric(req.body?.weight_kg),
      body_type_preference_slug: toNullableText(normalizeSlug(req.body?.body_type_preference || req.body?.body_type_preference_slug || "")),
      equipment_items_text: toNullableText(req.body?.equipment_items_text),
      equipment_notes: toNullableText(req.body?.equipment_notes),
      equipment_preset_slug: toNullableText(normalizeSlug(req.body?.equipment_preset || req.body?.equipment_preset_slug || "")),
      goal_notes: toNullableText(req.body?.goal_notes),
      ok_with_gymless_backup: toBool(req.body?.ok_with_gymless_backup, false),
      program_intensity_preference_slug: toNullableText(
        normalizeSlug(req.body?.program_intensity_preference || req.body?.program_intensity_preference_slug || ""),
      ),
      schedule_constraints: toNullableText(req.body?.schedule_constraints),
      theme_slug: toNullableText(normalizeSlug(req.body?.theme || req.body?.theme_slug || "")),
      bubble_creation_date: toTs(req.body?.bubble_creation_date),
      bubble_modified_date: toTs(req.body?.bubble_modified_date),
      slug: toNullableText(req.body?.slug),
      creator: toNullableText(req.body?.creator),
      bubble_user_raw: toNullableText(req.body?.bubble_user_raw || bubble_user_id),
      is_archived: toBool(req.body?.is_archived, false),
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userR = await client.query(
        `
        INSERT INTO app_user (bubble_user_id)
        VALUES ($1)
        ON CONFLICT (bubble_user_id)
        DO UPDATE SET updated_at = now()
        RETURNING id
        `,
        [bubble_user_id],
      );
      const user_id = userR.rows[0].id;

      const profileR = await client.query(
        `
        INSERT INTO client_profile (
          user_id,
          bubble_client_profile_id,
          display_name,
          fitness_level_slug,
          fitness_rank,
          equipment_items_slugs,
          injury_flags,
          preferred_days,
          main_goals_slugs,
          minutes_per_session,
          height_cm,
          weight_kg,
          body_type_preference_slug,
          equipment_items_text,
          equipment_notes,
          equipment_preset_slug,
          goal_notes,
          ok_with_gymless_backup,
          program_intensity_preference_slug,
          schedule_constraints,
          theme_slug,
          bubble_creation_date,
          bubble_modified_date,
          slug,
          creator,
          bubble_user_raw,
          is_archived,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::timestamptz,$23::timestamptz,$24,$25,$26,$27,now()
        )
        ON CONFLICT (bubble_client_profile_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          display_name = EXCLUDED.display_name,
          fitness_level_slug = EXCLUDED.fitness_level_slug,
          fitness_rank = EXCLUDED.fitness_rank,
          equipment_items_slugs = EXCLUDED.equipment_items_slugs,
          injury_flags = EXCLUDED.injury_flags,
          preferred_days = EXCLUDED.preferred_days,
          main_goals_slugs = EXCLUDED.main_goals_slugs,
          minutes_per_session = EXCLUDED.minutes_per_session,
          height_cm = EXCLUDED.height_cm,
          weight_kg = EXCLUDED.weight_kg,
          body_type_preference_slug = EXCLUDED.body_type_preference_slug,
          equipment_items_text = EXCLUDED.equipment_items_text,
          equipment_notes = EXCLUDED.equipment_notes,
          equipment_preset_slug = EXCLUDED.equipment_preset_slug,
          goal_notes = EXCLUDED.goal_notes,
          ok_with_gymless_backup = EXCLUDED.ok_with_gymless_backup,
          program_intensity_preference_slug = EXCLUDED.program_intensity_preference_slug,
          schedule_constraints = EXCLUDED.schedule_constraints,
          theme_slug = EXCLUDED.theme_slug,
          bubble_creation_date = EXCLUDED.bubble_creation_date,
          bubble_modified_date = EXCLUDED.bubble_modified_date,
          slug = EXCLUDED.slug,
          creator = EXCLUDED.creator,
          bubble_user_raw = EXCLUDED.bubble_user_raw,
          is_archived = EXCLUDED.is_archived,
          updated_at = now()
        RETURNING id
        `,
        [
          user_id,
          bubble_client_profile_id,
          payload.display_name,
          payload.fitness_level_slug,
          payload.fitness_rank,
          payload.equipment_items_slugs,
          payload.injury_flags,
          payload.preferred_days,
          payload.main_goals_slugs,
          payload.minutes_per_session,
          payload.height_cm,
          payload.weight_kg,
          payload.body_type_preference_slug,
          payload.equipment_items_text,
          payload.equipment_notes,
          payload.equipment_preset_slug,
          payload.goal_notes,
          payload.ok_with_gymless_backup,
          payload.program_intensity_preference_slug,
          payload.schedule_constraints,
          payload.theme_slug,
          payload.bubble_creation_date,
          payload.bubble_modified_date,
          payload.slug,
          payload.creator,
          payload.bubble_user_raw,
          payload.is_archived,
        ],
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        client_profile_id: profileR.rows[0].id,
        user_id,
        bubble_client_profile_id,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({
      ok: false,
      request_id: req.request_id,
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
    });
  }
});