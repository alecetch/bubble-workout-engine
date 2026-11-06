import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { runPipeline } from "../engine/runPipeline.js";
import { parseEmitterRows } from "../src/services/importEmitterService.js";
import { ensureWeeklyDb, makeWeeklyInputs } from "./helpers/weeklyProgression.js";
after(() => pool.end());
for (const type of ["strength", "hypertrophy", "conditioning", "hyrox"]) {
  for (const rank of ["beginner", "intermediate", "advanced"]) test(`weekly golden ${type} ${rank}`, async t => {
    if (!await ensureWeeklyDb(t, pool)) return;
    const config = (await pool.query("SELECT * FROM program_generation_config WHERE is_active=true AND program_type=$1 ORDER BY config_key LIMIT 1", [type])).rows[0];
    assert.ok(config, `Missing active ${type} config`);
    const out = await runPipeline({ db: pool, userId: null, programType: type, inputs: await makeWeeklyInputs(pool, type, rank), request: { config_key: config.config_key, anchor_day_ms: Date.UTC(2026, 0, 5) } });
    const parsed = parseEmitterRows(out.rows);
    const totals = Object.fromEntries(out.program.weeks.map(week => [week.week_index, parsed.exs.filter(ex => ex.program_day_key.startsWith(`PD_W${week.week_index}_`) && !["warmup", "cooldown"].includes(ex.segment_type)).reduce((sum, ex) => sum + ex.sets_prescribed, 0)]));
    await t.test("per-week prescriptions match the enriched engine days", () => {
      for (const week of out.program.weeks) for (const day of week.days) {
        const key = `PD_W${week.week_index}_D${day.day_index}`;
        const actual = parsed.exs.filter(ex => ex.program_day_key === key);
        const expected = day.segments.flatMap(seg => seg.items.map(item => ({ id: item.ex_id || item.exercise_id, sets: item.sets ?? item.sets_prescribed })));
        assert.equal(actual.length, expected.length);
        actual.forEach((ex, i) => { assert.equal(ex.exercise_id, expected[i].id); assert.equal(ex.sets_prescribed, expected[i].sets); });
        const segs = parsed.segs.filter(seg => seg.program_day_key === key);
        assert.deepEqual(segs.map(seg => seg.rounds), day.segments.map(seg => Number(seg.rounds)));
      }
    });
    function assertRecoveryVolume(week) {
      if (type !== "hyrox") {
        assert.ok(totals[week] < totals[1], JSON.stringify(totals));
        return;
      }
      // Owner-approved exception: the HYROX seed starts every block at one
      // set/round. Keep those prescriptions and the minimum of one unchanged;
      // a volume-reducing HYROX deload requires a separate coaching/config change.
      assert.equal(totals[week], totals[1]);
      for (const index of [1, week]) {
        const keyPrefix = `PD_W${index}_`;
        const work = parsed.exs.filter(ex => ex.program_day_key.startsWith(keyPrefix) && !["warmup", "cooldown"].includes(ex.segment_type));
        assert.ok(work.length > 0);
        assert.ok(work.every(ex => ex.sets_prescribed === 1), "HYROX exception only applies at the one-set floor");
        assert.ok(parsed.segs.filter(seg => seg.program_day_key.startsWith(keyPrefix) && !["warmup", "cooldown"].includes(seg.segment_type))
          .every(seg => seg.rounds === 1), "HYROX exception only applies at the one-round floor");
      }
    }
    await t.test(type === "hyrox" ? "HYROX preserves one-set prescriptions (approved deload exception)" : "final week deloads and strength/hypertrophy RIR rises", () => {
      const final = out.program.weeks.length;
      assertRecoveryVolume(final);
      if (["strength", "hypertrophy"].includes(type)) {
        const first = parsed.exs.find(ex => ex.program_day_key === "PD_W1_D1" && ex.purpose === "main" && ex.segment_type === "single");
        assert.ok(first);
        const last = parsed.exs.find(ex => ex.program_day_key === `PD_W${final}_D1` && ex.exercise_id === first.exercise_id && ex.purpose === first.purpose);
        assert.equal(Number(last.intensity_prescription.match(/~(\d+)/)?.[1]), Number(first.intensity_prescription.match(/~(\d+)/)?.[1]) + 2);
      }
    });
    await t.test("build weeks follow the rank set step", () => {
      if (config.progression_by_rank_json[rank].weekly_set_step > 0) assert.ok(totals[2] > totals[1], JSON.stringify(totals));
      else assert.equal(totals[2], totals[1]);
    });
    await t.test(type === "hyrox" ? "HYROX recovery copy has the documented one-set-floor exception" : "deload/consolidate copy agrees with delivered volume", () => {
      const weeks = out.program.narration.weeks.filter(week => ["DELOAD", "CONSOLIDATE"].includes(week.phase));
      assert.ok(weeks.length > 0);
      for (const week of weeks) assertRecoveryVolume(week.week_index);
    });
  });
}
test("every active config with final-week recovery copy has deload rules for all ranks", async t => {
  if (!await ensureWeeklyDb(t, pool)) return;
  const { rows } = await pool.query("SELECT config_key, progression_by_rank_json, week_phase_config_json FROM program_generation_config WHERE is_active=true");
  assert.ok(rows.length >= 4);
  for (const row of rows) if (["deload", "consolidate"].includes(row.week_phase_config_json.last_week_mode)) {
    for (const rank of ["beginner", "intermediate", "advanced", "elite"]) assert.ok(row.progression_by_rank_json[rank]?.deload, `${row.config_key}/${rank}`);
  }
});
