// api/src/services/calendarCoverage.js
//
// ensureProgramCalendarCoverage
// ─────────────────────────────
// After the importer has committed training-day rows into program_calendar_day,
// this function fills the gaps: every date in the program window that has no
// calendar row gets a recovery (is_training_day=false) row inserted.
//
// Design decisions:
//  • Single INSERT…SELECT from generate_series — no JS-side date loops.
//  • ON CONFLICT (program_id, scheduled_date) DO NOTHING — idempotent; the
//    existing UNIQUE constraint from V1 is the anchor.
//  • program_week_id / program_day_id are NULL for recovery rows (allowed by V10).
//  • program_day_key is deterministic: 'recovery:<program_id>:<YYYY-MM-DD>'.
//  • scheduled_weekday uses to_char('dy') → 'mon','tue',… matching the format
//    the importer writes from DAY emitter rows.
//  • After filling gaps, ensure all rows with a program_day_id are marked
//    is_training_day=true (guards against edge cases in legacy imports).
//
// Must be called AFTER importEmitterPayload commits AND AFTER the program row
// has been updated with its final start_date and weeks_count.

export async function ensureProgramCalendarCoverage(pool, programId) {
  // Fill every missing date in the program window with a recovery row.
  await pool.query(
    `
    INSERT INTO program_calendar_day (
      program_id,
      user_id,
      program_week_id,
      program_day_id,
      week_number,
      scheduled_offset_days,
      scheduled_weekday,
      scheduled_date,
      global_day_index,
      is_training_day,
      program_day_key
    )
    SELECT
      p.id                                                              AS program_id,
      p.user_id                                                         AS user_id,
      NULL::uuid                                                        AS program_week_id,
      NULL::uuid                                                        AS program_day_id,
      (gs.n / 7 + 1)::int                                              AS week_number,
      gs.n                                                             AS scheduled_offset_days,
      to_char(p.start_date + gs.n, 'dy')                               AS scheduled_weekday,
      p.start_date + gs.n                                              AS scheduled_date,
      (gs.n + 1)::int                                                  AS global_day_index,
      false                                                            AS is_training_day,
      'recovery:' || p.id::text || ':' || (p.start_date + gs.n)::text AS program_day_key
    FROM program p
    CROSS JOIN generate_series(0, p.weeks_count * 7 - 1) AS gs(n)
    WHERE p.id = $1::uuid
    ON CONFLICT (program_id, scheduled_date) DO NOTHING
    `,
    [programId],
  );

  // Guard: ensure any row that has a real program_day_id is marked as a
  // training day (idempotent; covers legacy rows that may have the wrong flag).
  await pool.query(
    `
    UPDATE program_calendar_day
    SET is_training_day = true
    WHERE program_id = $1
      AND program_day_id IS NOT NULL
      AND is_training_day = false
    `,
    [programId],
  );
}
