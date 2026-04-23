import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../db.js";

const hasDbConfig = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGUSER));
const dbTest = hasDbConfig ? test : test.skip;

dbTest("no alias exercise_id exists after V81", async () => {
  const result = await pool.query(
    `SELECT exercise_id FROM exercise_catalogue
     WHERE exercise_id IN (
       'barbell_back_squat', 'barbell_front_squat', 'pull_up',
       'hack_squat', 'lateral_raise', 'cable_row', 'barbell_deadlift'
     )`
  );
  assert.equal(result.rows.length, 0, "All alias rows should have been deleted by V81");
});

dbTest("canonical rows exist for all cleaned pairs", async () => {
  const result = await pool.query(
    `SELECT exercise_id FROM exercise_catalogue
     WHERE exercise_id IN (
       'bb_back_squat','bb_front_squat','pullup',
       'hack_squat_machine','db_lateral_raise','seated_cable_row','bb_deadlift'
     ) AND is_archived = FALSE`
  );
  assert.equal(result.rows.length, 7, "All canonical rows should be present and active");
});

dbTest("program_exercise has no alias exercise_id references", async () => {
  const result = await pool.query(
    `SELECT COUNT(*) AS cnt FROM program_exercise
     WHERE exercise_id IN (
       'barbell_back_squat','barbell_front_squat','pull_up',
       'hack_squat','lateral_raise','cable_row','barbell_deadlift'
     )`
  );
  assert.equal(Number(result.rows[0].cnt), 0, "program_exercise should reference only canonical IDs");
});

dbTest("technique columns exist on exercise_catalogue after V82", async () => {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'exercise_catalogue'
       AND column_name IN (
         'technique_cue','technique_setup',
         'technique_execution_json','technique_mistakes_json','technique_video_url'
       )`
  );
  assert.equal(result.rows.length, 5, "All five technique columns should exist after V82");
});

dbTest("key exercises have non-empty technique_cue", async () => {
  const result = await pool.query(
    `SELECT exercise_id FROM exercise_catalogue
     WHERE exercise_id IN ('bb_back_squat','bb_deadlift','bb_bench_press','pullup','ski_erg')
       AND (technique_cue IS NULL OR technique_cue = '')`
  );
  assert.equal(result.rows.length, 0, "Key exercises should have technique_cue populated");
});

test.after(async () => {
  if (hasDbConfig) {
    await pool.end();
  }
});
