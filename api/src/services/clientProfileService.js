import { pool } from "../db.js";

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
]);

export async function upsertUser(bubbleUserId) {
  const result = await pool.query(
    `
    INSERT INTO app_user (bubble_user_id)
    VALUES ($1)
    ON CONFLICT (bubble_user_id)
    DO UPDATE SET updated_at = now()
    RETURNING id
    `,
    [bubbleUserId],
  );

  return { id: result.rows[0].id };
}

export async function upsertProfile(pgUserId, bubbleClientProfileId) {
  const insertResult = await pool.query(
    `
    INSERT INTO client_profile (user_id, bubble_client_profile_id)
    VALUES ($1, $2)
    ON CONFLICT (bubble_client_profile_id)
    DO NOTHING
    RETURNING id
    `,
    [pgUserId, bubbleClientProfileId],
  );

  if (insertResult.rowCount > 0) {
    return insertResult.rows[0].id;
  }

  const selectResult = await pool.query(
    `
    SELECT id
    FROM client_profile
    WHERE bubble_client_profile_id = $1
    LIMIT 1
    `,
    [bubbleClientProfileId],
  );

  return selectResult.rows[0]?.id ?? null;
}

export async function getProfileByBubbleUserId(bubbleUserId) {
  const result = await pool.query(
    `
    SELECT cp.*
    FROM client_profile cp
    JOIN app_user au ON cp.user_id = au.id
    WHERE au.bubble_user_id = $1
    LIMIT 1
    `,
    [bubbleUserId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return toApiShape(result.rows[0]);
}

export async function patchProfile(profileId, fields) {
  const assignments = [];
  const values = [];

  for (const [field, column] of profileFieldToColumn.entries()) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
    if (fields[field] === undefined) continue;
    values.push(fields[field]);
    assignments.push(`${column} = $${values.length}`);
  }

  assignments.push("updated_at = now()");

  values.push(profileId);
  const result = await pool.query(
    `
    UPDATE client_profile
    SET ${assignments.join(", ")}
    WHERE bubble_client_profile_id = $${values.length}
    RETURNING *
    `,
    values,
  );

  if (result.rowCount === 0) {
    return null;
  }

  return toApiShape(result.rows[0]);
}

export function toApiShape(row) {
  return {
    id: row.bubble_client_profile_id,
    userId: row.bubble_client_profile_id,
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
  };
}
