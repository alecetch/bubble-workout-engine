import { buildInputsFromProfile } from "../../src/services/buildInputsFromProfile.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
export async function ensureWeeklyDb(t, db) {
  try { await db.query("SELECT 1"); return true; }
  catch (error) { t.skip(`Postgres unavailable: ${error.code || error.message}`); return false; }
}
export async function makeWeeklyInputs(db, programType, fitnessLevel) {
  // Same input-building path as emitterSmoke.integration.test.js, with all equipment
  // so every config/rank exercises its full seeded progression rules.
  const equipment = (await db.query("SELECT exercise_slug FROM equipment_items")).rows.map(row => row.exercise_slug);
  const rank = ["beginner", "intermediate", "advanced", "elite"].indexOf(fitnessLevel);
  const allowed = new Set(await getAllowedExerciseIds(db, { fitness_rank: rank, equipment_items_slugs: equipment }));
  const catalogue = (await db.query("SELECT * FROM exercise_catalogue WHERE is_archived = false ORDER BY exercise_id")).rows.filter(row => allowed.has(row.exercise_id));
  return buildInputsFromProfile({ fitnessLevel, injuryFlags: [], equipmentItemCodes: equipment,
    preferredDays: ["Mon", "Wed", "Fri"], minutesPerSession: 60, goals: [programType] }, catalogue);
}
