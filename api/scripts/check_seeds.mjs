#!/usr/bin/env node
/**
 * Seed smoke check runner.
 *
 * Verifies that all repeatable seed migrations have applied their expected
 * reference / config rows. Exits 0 on all-pass, 1 on any failure, 2 on
 * configuration error.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/check_seeds.mjs
 *   npm run qa:seeds
 *
 * Local docker-compose:
 *   DATABASE_URL=postgres://app:app@localhost:5432/app npm run qa:seeds
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

// ---------------------------------------------------------------------------
// Check definitions — must stay in sync with the seed migrations.
// Each check counts specific, known rows rather than total table size.
// ---------------------------------------------------------------------------
const CHECK_SQL = `
WITH checks AS (
  SELECT
    'equipment_seed_rows_present'::text AS check_name,
    (SELECT COUNT(*) FROM public.equipment_items
      WHERE bubble_id LIKE 'seed_eq_%')::int AS actual,
    9::int AS expected_min

  UNION ALL SELECT
    'exercise_seed_rows_present',
    (SELECT COUNT(*) FROM public.exercise_catalogue
      WHERE bubble_unique_id LIKE 'seed_ex_%')::int,
    10

  UNION ALL SELECT
    'narration_templates_present',
    (SELECT COUNT(*) FROM public.narration_template WHERE template_id IN (
      'prog_title_1','prog_summary_1','prog_progression_1','prog_safety_1',
      'day_title_1','day_goal_1','warmup_title_1','warmup_heat_1','warmup_ramp_1',
      'seg_title_main','seg_title_secondary','seg_title_accessory',
      'seg_exec_single','seg_exec_superset','seg_exec_giant',
      'exercise_line_1','exercise_cue_1','exercise_log_1'
    ))::int,
    18

  UNION ALL SELECT
    'program_generation_config_present',
    (SELECT COUNT(*) FROM public.program_generation_config
      WHERE config_key = 'hypertrophy_default_v1')::int,
    1

  UNION ALL SELECT
    'media_assets_seed_rows_present',
    (SELECT COUNT(*) FROM public.media_assets WHERE image_key IN (
      'program_day/mixed_full_body.png',
      'program_day/recovery_recovery.png',
      'program_day/conditioning_conditioning.png',
      'program/mixed_full_body.png',
      'program_day/skills_lower_body.png',
      'program_day/hypertrophy_upper_body.png',
      'program/hypertrophy.png',
      'program_day/hypertrophy_lower_body.png',
      'program_day/hypertrophy_full_body.png'
    ))::int,
    9

  UNION ALL SELECT
    'program_rep_rules_seed_rows_present',
    (SELECT COUNT(*) FROM public.program_rep_rule WHERE rule_id IN (
      'hyp_global_fallback_v1','hyp_main_default_v1','hyp_main_squat_v1',
      'hyp_main_hinge_v1','hyp_main_push_horizontal_v1','hyp_superset_main_v1',
      'hyp_secondary_default_v1','hyp_secondary_pull_horizontal_v1',
      'hyp_secondary_lunge_v1','hyp_push_vertical_secondary_v1',
      'hyp_pull_vertical_secondary_v1','hyp_superset_secondary_v1',
      'hyp_giant_secondary_v1','hyp_accessory_default_v1','hyp_accessory_arms_v1',
      'hyp_accessory_calves_v1','hyp_isolation_general_v1','hyp_giant_accessory_v1'
    ))::int,
    18

  UNION ALL SELECT
    'strength_primary_region_seeded',
    (SELECT COUNT(*) FROM public.exercise_catalogue
      WHERE exercise_id IN (
        'barbell_back_squat','barbell_deadlift','bench_press',
        'barbell_row','ohp','pull_up'
      )
      AND strength_primary_region IN ('upper','lower'))::int,
    6
)
SELECT
  check_name,
  actual,
  expected_min,
  CASE WHEN actual >= expected_min THEN 'PASS' ELSE 'FAIL' END AS status
FROM checks
ORDER BY check_name
`;

async function run() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`ERROR: Could not connect to database: ${err.message}`);
    process.exit(2);
  }

  let rows;
  try {
    const result = await client.query(CHECK_SQL);
    rows = result.rows;
  } catch (err) {
    console.error(`ERROR: Check query failed: ${err.message}`);
    client.release();
    await pool.end();
    process.exit(2);
  }

  client.release();
  await pool.end();

  // ── Print results ──────────────────────────────────────────────────────────
  const nameWidth = Math.max(...rows.map((r) => r.check_name.length));
  const divider = "─".repeat(nameWidth + 20);

  console.log("\nSeed smoke checks");
  console.log(divider);

  let failCount = 0;
  for (const row of rows) {
    const pass = row.status === "PASS";
    const marker = pass ? "✓" : "✗";
    const label = row.check_name.padEnd(nameWidth + 2);
    const count = `${row.actual}/${row.expected_min}`.padStart(7);
    console.log(`  ${marker} ${label} ${count}  ${row.status}`);
    if (!pass) failCount++;
  }

  console.log(divider);

  if (failCount > 0) {
    console.error(`\n  ${failCount} check(s) FAILED — seed data is missing or incomplete.\n`);
    process.exit(1);
  }

  console.log(`\n  All ${rows.length} checks passed.\n`);
}

run().catch((err) => {
  console.error(`ERROR: Unexpected failure: ${err.message}`);
  process.exit(1);
});
