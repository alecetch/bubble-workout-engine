// Shared with the PR feed: confirmed weight records against all earlier history.
export const PR_PROGRESS_CTE = `WITH all_logs AS (
      SELECT
        sel.id,
        sel.weight_kg,
        sel.reps_completed,
        sel.estimated_1rm_kg,
        sel.created_at,
        pe.exercise_id,
        COALESCE(ec.name, pe.exercise_name) AS exercise_name,
        ec.strength_primary_region AS region,
        pd.scheduled_date
      FROM segment_exercise_log sel
      JOIN program_exercise pe ON pe.id = sel.program_exercise_id
      LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
      JOIN program_day pd ON pd.id = sel.program_day_id
      JOIN program p ON p.id = sel.program_id
      WHERE p.user_id = $1
        AND sel.is_draft = FALSE
        AND sel.weight_kg IS NOT NULL
    ),
    with_prev AS (
      SELECT *,
        MAX(weight_kg) OVER (
          PARTITION BY exercise_id
          ORDER BY scheduled_date ASC, created_at ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prev_best_kg
      FROM all_logs
    )`;

export async function countYearPersonalRecords(db, userId, year) {
  const result = await db.query(`${PR_PROGRESS_CTE}
    SELECT COUNT(DISTINCT exercise_id)::int AS count FROM with_prev
    WHERE weight_kg > COALESCE(prev_best_kg, 0)
      AND scheduled_date BETWEEN $2::date AND $3::date`, [userId, `${year}-01-01`, `${year}-12-31`]);
  return result.rows[0].count;
}
