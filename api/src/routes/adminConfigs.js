import express from "express";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { auditLog } from "../utils/auditLog.js";
import { safeString, requireNonEmpty, RequestValidationError } from "../utils/validate.js";

export const adminConfigsRouter = express.Router();

adminConfigsRouter.use(requireInternalToken, requireTrustedAdminOrigin);

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
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
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
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
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

    await auditLog(req, {
      action: "update",
      entity: "program_generation_config",
      entityId: result.rows[0].config_key,
      detail: {
        fields_updated: [
          "program_generation_config_json",
          progression_by_rank_json != null ? "progression_by_rank_json" : null,
          week_phase_config_json != null ? "week_phase_config_json" : null,
          total_weeks_default != null ? "total_weeks_default" : null,
          notes != null ? "notes" : null,
          typeof is_active === "boolean" ? "is_active" : null,
        ].filter(Boolean),
      },
    });

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminConfigsRouter.post("/configs", async (req, res) => {
  try {
    const source_key = req.body?.source_key;
    const new_key = req.body?.new_key;

    try {
      requireNonEmpty(source_key, "source_key");
      requireNonEmpty(new_key, "new_key");
    } catch (err) {
      if (err instanceof RequestValidationError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      throw err;
    }

    const sourceKey = safeString(source_key);
    const newKey = safeString(new_key);

    const exists = await pool.query(
      `SELECT 1 FROM public.program_generation_config WHERE config_key = $1`,
      [newKey],
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
      [sourceKey, newKey],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Source config not found" });
    }

    await auditLog(req, {
      action: "create",
      entity: "program_generation_config",
      entityId: result.rows[0].config_key,
      detail: { source_key: sourceKey },
    });

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
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

    await auditLog(req, {
      action: "activate",
      entity: "program_generation_config",
      entityId: result.rows[0].config_key,
      detail: { is_active },
    });

    return res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
