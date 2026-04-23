import { pool as defaultPool } from "../db.js";

const profileFieldToColumn = new Map([
  ["goals", "main_goals_slugs"],
  ["fitnessLevel", "fitness_level_slug"],
  ["injuryFlags", "injury_flags"],
  ["goalNotes", "goal_notes"],
  ["equipmentPreset", "equipment_preset_slug"],
  ["equipmentItemCodes", "equipment_items_slugs"],
  ["preferredDays", "preferred_days"],
  ["scheduleConstraints", "schedule_constraints"],
  ["heightCm", "height_cm"],
  ["weightKg", "weight_kg"],
  ["minutesPerSession", "minutes_per_session"],
  ["sex", "sex"],
  ["ageRange", "age_range"],
  ["onboardingStepCompleted", "onboarding_step_completed"],
  ["onboardingCompletedAt", "onboarding_completed_at"],
  ["programType", "program_type_slug"],
  ["preferredUnit", "preferred_unit"],
  ["preferredHeightUnit", "preferred_height_unit"],
  ["anchorLiftsSkipped", "anchor_lifts_skipped"],
  ["anchorLiftsCollectedAt", "anchor_lifts_collected_at"],
]);

export function makeClientProfileService(db = defaultPool) {
  async function upsertUser(userId) {
    const result = await db.query(
      `
      INSERT INTO app_user (subject_id)
      VALUES ($1)
      ON CONFLICT (subject_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [userId],
    );

    return { id: result.rows[0].id };
  }

  async function upsertProfile(pgUserId) {
    const result = await db.query(
      `
      INSERT INTO client_profile (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO NOTHING
      RETURNING id
      `,
      [pgUserId],
    );

    if (result.rowCount > 0) {
      return result.rows[0].id;
    }

    const selectResult = await db.query(
      `
      SELECT id
      FROM client_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [pgUserId],
    );

    return selectResult.rows[0]?.id ?? null;
  }

  async function getProfileByUserId(userId) {
    const result = await db.query(
      `
      SELECT cp.*
      FROM client_profile cp
      JOIN app_user au ON cp.user_id = au.id
      WHERE au.subject_id = $1
      LIMIT 1
      `,
      [userId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return toApiShape(result.rows[0]);
  }

  async function getProfileById(profileId) {
    const result = await db.query(
      `
      SELECT cp.*
      FROM client_profile cp
      WHERE cp.id::text = $1
      LIMIT 1
      `,
      [profileId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return toApiShape(result.rows[0]);
  }

  async function patchProfile(profileId, fields) {
    const assignments = [];
    const values = [];

    for (const [field, value] of Object.entries(fields)) {
      const column = profileFieldToColumn.get(field);
      if (!column) continue;
      if (value === undefined) continue;
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }

    assignments.push("updated_at = now()");

    values.push(profileId);
    const result = await db.query(
      `
      UPDATE client_profile
      SET ${assignments.join(", ")}
      WHERE id::text = $${values.length}
      RETURNING *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return null;
    }

    return toApiShape(result.rows[0]);
  }

  return { upsertUser, upsertProfile, getProfileByUserId, getProfileById, patchProfile };
}

const _default = makeClientProfileService();
export const upsertUser = _default.upsertUser;
export const upsertProfile = _default.upsertProfile;
export const getProfileByUserId = _default.getProfileByUserId;
export const getProfileById = _default.getProfileById;
export const patchProfile = _default.patchProfile;

export function toApiShape(row) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    goals: row.main_goals_slugs ?? [],
    fitnessLevel: row.fitness_level_slug ?? null,
    injuryFlags: row.injury_flags ?? [],
    goalNotes: row.goal_notes ?? "",
    equipmentPreset: row.equipment_preset_slug ?? null,
    equipmentItemCodes: row.equipment_items_slugs ?? [],
    preferredDays: row.preferred_days ?? [],
    scheduleConstraints: row.schedule_constraints ?? "",
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    minutesPerSession: row.minutes_per_session ?? null,
    sex: row.sex ?? null,
    ageRange: row.age_range ?? null,
    onboardingStepCompleted: row.onboarding_step_completed ?? 0,
    onboardingCompletedAt: row.onboarding_completed_at ?? null,
    programType: row.program_type_slug ?? null,
    preferredUnit: row.preferred_unit ?? "kg",
    preferredHeightUnit: row.preferred_height_unit ?? "cm",
    anchorLiftsSkipped: row.anchor_lifts_skipped ?? false,
    anchorLiftsCollectedAt: row.anchor_lifts_collected_at ?? null,
  };
}
