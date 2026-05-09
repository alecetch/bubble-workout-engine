import express from "express";
import { pool } from "../db.js";
import { regenerateDaysWithEquipment } from "../services/partialDayRegenService.js";

export const equipmentRegenRouter = express.Router();

function safeString(value) {
  return String(value ?? "").trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    safeString(value),
  );
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeString(item))
    .filter(Boolean);
}

function createValidationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function assertOwnedProgram(db, programId, userId) {
  const result = await db.query(`SELECT id FROM program WHERE id = $1 AND user_id = $2`, [programId, userId]);
  return result.rowCount > 0;
}

equipmentRegenRouter.get("/program/:programId/equipment", async (req, res) => {
  const programId = safeString(req.params.programId);
  const userId = req.auth?.user_id;

  try {
    if (!isUuid(programId)) {
      throw createValidationError("programId must be a valid UUID");
    }

    const owned = await assertOwnedProgram(pool, programId, userId);
    if (!owned) {
      return res.status(404).json({ ok: false, code: "not_found", error: "Program not found" });
    }

    const profileR = await pool.query(
      `SELECT cp.equipment_preset_slug, cp.equipment_items_slugs
       FROM client_profile cp
       JOIN program p ON p.user_id = cp.user_id
       WHERE p.id = $1 AND p.user_id = $2`,
      [programId, userId],
    );

    const today = new Date().toISOString().slice(0, 10);
    const daysR = await pool.query(
      `SELECT id, scheduled_date, scheduled_weekday, week_number,
              equipment_override_preset_slug, equipment_override_items_slugs
       FROM program_day
       WHERE program_id = $1
         AND is_completed = false
         AND scheduled_date >= $2
       ORDER BY scheduled_date ASC`,
      [programId, today],
    );

    return res.json({
      profileDefault: {
        equipmentPresetSlug: profileR.rows[0]?.equipment_preset_slug ?? null,
        equipmentItemSlugs: profileR.rows[0]?.equipment_items_slugs ?? [],
      },
      futureDays: daysR.rows.map((row) => ({
        programDayId: row.id,
        scheduledDate: row.scheduled_date,
        scheduledWeekday: row.scheduled_weekday,
        weekNumber: Number(row.week_number ?? 1),
        equipmentOverridePresetSlug: row.equipment_override_preset_slug ?? null,
        equipmentOverrideItemSlugs: row.equipment_override_items_slugs ?? null,
      })),
    });
  } catch (error) {
    const status = error?.status ?? 500;
    return res.status(status).json({
      ok: false,
      code: status === 400 ? "validation_error" : "internal_error",
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});

equipmentRegenRouter.post("/program/:programId/regenerate-days", async (req, res) => {
  const programId = safeString(req.params.programId);
  const userId = req.auth?.user_id;

  try {
    if (!isUuid(programId)) {
      throw createValidationError("programId must be a valid UUID");
    }

    const owned = await assertOwnedProgram(pool, programId, userId);
    if (!owned) {
      return res.status(404).json({ ok: false, code: "not_found", error: "Program not found" });
    }

    const dayIds = Array.isArray(req.body?.dayIds) ? req.body.dayIds.map((id) => safeString(id)) : [];
    if (dayIds.length === 0 || dayIds.some((id) => !isUuid(id))) {
      throw createValidationError("dayIds must be a non-empty array of valid UUIDs");
    }

    if (!Array.isArray(req.body?.equipmentItemSlugs)) {
      throw createValidationError("equipmentItemSlugs must be an array");
    }

    const matchingDaysR = await pool.query(
      `SELECT id
       FROM program_day
       WHERE id = ANY($1::uuid[])
         AND program_id = $2`,
      [dayIds, programId],
    );
    if (matchingDaysR.rowCount !== dayIds.length) {
      throw createValidationError("All dayIds must belong to the selected program");
    }

    const result = await regenerateDaysWithEquipment(pool, {
      programId,
      userId,
      dayIds,
      equipmentPresetSlug: req.body?.equipmentPresetSlug == null ? null : safeString(req.body.equipmentPresetSlug),
      equipmentItemSlugs: normalizeStringArray(req.body?.equipmentItemSlugs),
    });

    return res.json(result);
  } catch (error) {
    const status = error?.status ?? 500;
    return res.status(status).json({
      ok: false,
      code: status === 400 ? "validation_error" : status === 404 ? "not_found" : "regeneration_error",
      error: error instanceof Error ? error.message : "Internal error",
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
});
