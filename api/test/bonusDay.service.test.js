import test from "node:test";
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
