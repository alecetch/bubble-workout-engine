import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";

export const adminConfigsRouter = express.Router();

adminConfigsRouter.use(requireInternalToken);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

adminConfigsRouter.get("/configs", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, config_key, program_type, schema_version, is_active, updated_at
      FROM public.program_generation_config
      ORDER BY program_type ASC, config_key ASC
    `);
    return res.json({ configs: result.rows ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

adminConfigsRouter.get("/configs/:key", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, config_key, program_type, schema_version, is_active,
             total_weeks_default, notes,
             program_generation_config_json,
             progression_by_rank_json,
             week_phase_config_json,
             updated_at
      FROM public.program_generation_config
      WHERE config_key = $1
      `,
      [req.params.key],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Config not found" });
    }

    return res.json({ config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

adminConfigsRouter.put("/configs/:key", async (req, res) => {
  try {
    const {
      program_generation_config_json,
      progression_by_rank_json,
      week_phase_config_json,
      total_weeks_default,
      notes,
      is_active,
    } = req.body ?? {};

    if (!isPlainObject(program_generation_config_json)) {
      return res
        .status(400)
        .json({ error: "program_generation_config_json must be a non-null object" });
    }

    const result = await pool.query(
      `
      UPDATE public.program_generation_config
      SET
        program_generation_config_json = $1,
        progression_by_rank_json       = COALESCE($2, progression_by_rank_json),
        week_phase_config_json         = COALESCE($3, week_phase_config_json),
        total_weeks_default            = COALESCE($4, total_weeks_default),
        notes                          = COALESCE($5, notes),
        is_active                      = COALESCE($6, is_active),
        updated_at                     = now()
      WHERE config_key = $7
      RETURNING id, config_key, program_type, is_active, updated_at
      `,
      [
        program_generation_config_json,
        progression_by_rank_json ?? null,
        week_phase_config_json ?? null,
        total_weeks_default ?? null,
        notes ?? null,
        typeof is_active === "boolean" ? is_active : null,
        req.params.key,
      ],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Config not found" });
    }

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

adminConfigsRouter.post("/configs", async (req, res) => {
  try {
    const source_key = req.body?.source_key;
    const new_key = req.body?.new_key;

    if (!nonEmptyString(source_key) || !nonEmptyString(new_key)) {
      return res.status(400).json({ ok: false, error: "source_key and new_key are required" });
    }

    const exists = await pool.query(
      `SELECT 1 FROM public.program_generation_config WHERE config_key = $1`,
      [new_key.trim()],
    );
    if (exists.rows?.length) {
      return res.status(409).json({ ok: false, error: "new_key already exists" });
    }

    const result = await pool.query(
      `
      INSERT INTO public.program_generation_config
        (config_key, program_type, schema_version, is_active, notes,
         program_generation_config_json, progression_by_rank_json,
         week_phase_config_json, total_weeks_default, updated_at)
      SELECT
        $2, program_type, schema_version, false,
        'Duplicated from ' || config_key,
        program_generation_config_json, progression_by_rank_json,
        week_phase_config_json, total_weeks_default, now()
      FROM public.program_generation_config
      WHERE config_key = $1
      RETURNING id, config_key, program_type, is_active
      `,
      [source_key.trim(), new_key.trim()],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Source config not found" });
    }

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

adminConfigsRouter.patch("/configs/:key/activate", async (req, res) => {
  try {
    const is_active = req.body?.is_active;
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ ok: false, error: "is_active must be a boolean" });
    }

    const result = await pool.query(
      `
      UPDATE public.program_generation_config
      SET is_active = $1, updated_at = now()
      WHERE config_key = $2
      RETURNING id, config_key, program_type, is_active, updated_at
      `,
      [is_active, req.params.key],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Config not found" });
    }

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});
