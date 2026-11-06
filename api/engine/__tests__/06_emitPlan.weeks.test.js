import test from "node:test";
import assert from "node:assert/strict";
import { emitPlanRows } from "../steps/06_emitPlan.js";
import { parseEmitterRows } from "../../src/services/importEmitterService.js";
function day(week = 0) {
  return { day_index: 1, day_type: "strength", duration_mins: 50, narration: { day: { title: `Day ${week}` } }, segments: [
    { segment_type: "single", purpose: "main", rounds: 1, items: [{ ex_id: "squat", sets: 4 + week, reps_prescribed: String(5 + week), rir_target: 2 + week, rest_after_set_sec: 120 + week }] },
    { segment_type: "superset", purpose: "secondary", rounds: 2 + week, items: [{ ex_id: "row", sets: 1, reps_prescribed: "10", rir_target: 2, rest_after_set_sec: 60 }] },
  ] };
}
async function emit(program, programLength = 2) {
  return emitPlanRows({ program, programLength, anchorDayMs: Date.UTC(2026, 0, 5), preferredDaysJson: "Mon" });
}
const template = () => ({ days_per_week: 1, days: [day()] });
test("emitter uses the matching week day for EX prescriptions and SEG rounds", async () => {
  // Deliberately unordered: resolve by week_index, not array position.
  const out = await emit({ ...template(), weeks: [{ week_index: 2, days: [day(2)] }, { week_index: 1, days: [day(1)] }] });
  const parsed = parseEmitterRows(out.rows);
  for (const week of [1, 2]) {
    const key = `PD_W${week}_D1`;
    const row = parsed.exs.find(ex => ex.program_day_key === key && ex.exercise_id === "squat");
    assert.equal(row.sets_prescribed, 4 + week);
    assert.equal(row.reps_prescribed, String(5 + week));
    assert.equal(row.intensity_prescription, `~${2 + week} RIR`);
    assert.equal(row.rest_seconds, 120 + week);
    assert.equal(parsed.segs.find(seg => seg.program_day_key === key && seg.segment_type === "superset").rounds, 2 + week);
  }
  assert.equal(out.debug.source, "weeks");
  assert.deepEqual(out.debug.sets_by_week, { 1: 6, 2: 7 });
  assert.equal(out.debug.template_fallback_days, 0);
});
test("template fallback preserves rows, column counts, keys and scheduling", async () => {
  const base = await emit(template());
  const weeks = await emit({ ...template(), weeks: [{ week_index: 1, days: [day(1)] }] });
  assert.equal(base.debug.source, "template");
  assert.equal(base.debug.template_fallback_days, 2);
  assert.equal(weeks.debug.template_fallback_days, 1);
  assert.equal(weeks.rows.length, base.rows.length);
  const split = out => out.rows.map(row => row.split("|"));
  assert.deepEqual(split(weeks).map(row => [row[0], row.length]), split(base).map(row => [row[0], row.length]));
  assert.deepEqual(split(weeks).filter(row => row[0] === "DAY").map(row => row.slice(12, 15)), split(base).filter(row => row[0] === "DAY").map(row => row.slice(12, 15)));
  const parsed = parseEmitterRows(weeks.rows);
  assert.equal(parsed.exs.find(row => row.program_day_key === "PD_W2_D1" && row.exercise_id === "squat").sets_prescribed, 4);
  const explicit = await emit({ ...template(), weeks: [1, 2].map(week_index => ({ week_index, days: [day()] })) });
  assert.deepEqual(explicit.rows.filter(row => !row.startsWith("PRG|")), base.rows.filter(row => !row.startsWith("PRG|")));
});
test("a missing day in an existing week falls back to its template", async () => {
  const out = await emit({ ...template(), weeks: [{ week_index: 1, days: [] }] }, 1);
  assert.equal(out.debug.source, "template");
  assert.equal(out.debug.template_fallback_days, 1);
});
