// src/engine/getAllowedExerciseIds.js
// Computes allowed exercise ids from Postgres using client_profile + exercise_catalogue.
// Matches Bubble server-script behavior:
// - rank gate
// - injury contra gate
// - equipment "must have all required" gate

export async function getAllowedExerciseIds(client, { fitness_rank, injury_flags_slugs, equipment_items_slugs }) {
  const rank = Number.isFinite(Number(fitness_rank)) ? Number(fitness_rank) : 0;
  const injuries = Array.isArray(injury_flags_slugs) ? injury_flags_slugs : [];
  const equipment = Array.isArray(equipment_items_slugs) ? equipment_items_slugs : [];

  const r = await client.query(
    `
    SELECT exercise_id
    FROM exercise_catalogue
    WHERE is_archived = false
      AND min_fitness_rank <= $1
      AND NOT (contraindications_slugs && $2::text[])
      AND equipment_items_slugs <@ $3::text[]
    ORDER BY exercise_id
    `,
    [rank, injuries, equipment],
  );

  return r.rows.map((x) => x.exercise_id);
}