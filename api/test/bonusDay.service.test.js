import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { runPipeline } from "../engine/runPipeline.js";
import { addBonusDay } from "../src/services/bonusDayService.js";
import { ensureWeeklyDb, makeWeeklyInputs } from "./helpers/weeklyProgression.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, insertTemplateForDate, templateHeroMediaId } from "../src/services/bonusDayService.js";

test("daysBetween handles Postgres Date objects for program start dates", () => {
  assert.equal(daysBetween(new Date("2026-05-18T00:00:00.000Z"), "2026-05-23"), 5);
});

test("templateHeroMediaId reads the generated day's hero from the pipeline's expanded weeks", () => {
  const pipelineOut = {
    program: {
      hero_media_id: "program-hero",
      days: [{ day_index: 1, hero_media_id: "template-day-hero" }],
      weeks: [{ week_index: 1, days: [{ day_index: 1, hero_media_id: "week1-day1-hero" }] }],
    },
  };
  assert.equal(templateHeroMediaId(pipelineOut), "week1-day1-hero");
});

test("templateHeroMediaId falls back to the template days when weeks are absent", () => {
  assert.equal(templateHeroMediaId({ program: { days: [{ hero_media_id: "template-day-hero" }] } }), "template-day-hero");
});

test("templateHeroMediaId returns null when the pipeline assigned no hero", () => {
  assert.equal(templateHeroMediaId({ program: { weeks: [{ days: [{ day_index: 1 }] }] } }), null);
  assert.equal(templateHeroMediaId({}), null);
  assert.equal(templateHeroMediaId(undefined), null);
});

// A mock pg client that records every query and answers the ones insertTemplateForDate makes.
function recordingClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM program_week pw/i.test(sql)) return { rowCount: 1, rows: [{ id: "week-1", week_number: 1 }] };
      if (/MAX\(global_day_index\)/i.test(sql)) return { rowCount: 1, rows: [{ next_index: 4 }] };
      if (/MAX\(day_number\)/i.test(sql)) return { rowCount: 1, rows: [{ next_day: 4 }] };
      if (/INSERT INTO program_day/i.test(sql)) return { rowCount: 1, rows: [{ id: "day-1" }] };
      return { rowCount: 0, rows: [] };
    },
  };
}

function insertArgs(overrides = {}) {
  return {
    programId: "prog-1",
    userId: "user-1",
    startDate: "2026-10-05",
    targetDate: "2026-10-13",
    templateDay: { day_label: "Day 1: Full Body Session", day_type: "strength", session_duration_mins: 60 },
    templateSegs: [],
    templateExs: [],
    programType: "strength",
    focusType: "full",
    hasProgramCalendarDayUserId: true,
    ...overrides,
  };
}

function programDayInsert(client) {
  const call = client.calls.find((c) => /INSERT INTO program_day\b/i.test(c.sql));
  assert.ok(call, "expected an INSERT INTO program_day");
  return call;
}

test("insertTemplateForDate writes the pipeline's hero onto the bonus program_day", async () => {
  const client = recordingClient();
  const dayId = await insertTemplateForDate(client, insertArgs({ heroMediaId: "hero-1" }));

  assert.equal(dayId, "day-1");
  const call = programDayInsert(client);
  assert.match(call.sql, /\bhero_media_id\b/);
  assert.equal(call.params.at(-1), "hero-1");
});

test("insertTemplateForDate inserts a null hero when none is passed", async () => {
  const client = recordingClient();
  await insertTemplateForDate(client, insertArgs());

  const call = programDayInsert(client);
  assert.match(call.sql, /\bhero_media_id\b/);
  assert.equal(call.params.at(-1), null);
});

after(() => pool.end());
test("a bonus day persists base sets without a deload RIR bump", async t => {
  if (!await ensureWeeklyDb(t, pool)) return;
  const user = (await pool.query("INSERT INTO app_user(subject_id) VALUES ($1) RETURNING id", [randomUUID()])).rows[0];
  try {
    const equipment = (await pool.query("SELECT exercise_slug FROM equipment_items")).rows.map(row => row.exercise_slug);
    await pool.query(`INSERT INTO client_profile(user_id,fitness_level_slug,fitness_rank,equipment_items_slugs,preferred_days,minutes_per_session,main_goals_slugs)
      VALUES ($1,'intermediate',1,$2,ARRAY['mon'],60,ARRAY['strength'])`, [user.id, equipment]);
    const program = (await pool.query(`INSERT INTO program(user_id,program_title,program_summary,weeks_count,days_per_week,program_outline_json,
      start_date,start_offset_days,start_weekday,preferred_days_sorted_json,program_type,is_ready,is_primary)
      VALUES ($1,'Bonus test','',4,1,'{}'::jsonb,'2026-11-02',0,'mon','["mon"]'::jsonb,'strength',true,true) RETURNING id`, [user.id])).rows[0];
    const result = await addBonusDay(pool, { programId: program.id, userId: user.id, programType: "strength", targetDate: "2026-11-03", scope: "today" });
    const actual = (await pool.query("SELECT exercise_id,sets_prescribed,intensity_prescription FROM program_exercise WHERE program_day_id=$1 AND segment_type NOT IN ('warmup','cooldown') ORDER BY order_in_day", [result.programDayId])).rows;
    const inputs = await makeWeeklyInputs(pool, "strength", "intermediate");
    const out = await runPipeline({ db: pool, userId: null, programType: "strength", inputs,
      request: { config_key: "strength_default_v1", program_length: 1, days_per_week: 1, preferred_days_json: "Tue", fitness_rank: 1, duration_mins: 60, anchor_day_ms: Date.UTC(2026,10,3) } });
    const expected = out.program.days[0].segments.filter(seg => !["warmup","cooldown"].includes(seg.segment_type)).flatMap(seg => seg.items);
    assert.ok(actual.length > 0);
    assert.deepEqual(actual.map(row => row.sets_prescribed), expected.map(item => item.sets));
    const weekItems = out.program.weeks[0].days[0].segments.flatMap(seg => seg.items);
    assert.ok(weekItems.every(item => item.deload_rir_bump == null));
    assert.deepEqual(actual.map(row => row.intensity_prescription), expected.map(item => item.rir_target ? `~${item.rir_target} RIR` : ""));
  } finally {
    await pool.query("DELETE FROM program WHERE user_id=$1", [user.id]);
    await pool.query("DELETE FROM app_user WHERE id=$1", [user.id]);
  }
});
