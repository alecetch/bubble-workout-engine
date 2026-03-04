import test from "node:test";
import assert from "node:assert/strict";
import { emitPlanRows, roundSegmentDurationSeconds } from "../steps/06_emitPlan.js";

function makeProgram(durationMins = 10) {
  return {
    program_type: "hypertrophy",
    days_per_week: 1,
    days: [
      {
        day_index: 1,
        day_type: "hypertrophy",
        duration_mins: durationMins,
        segments: [
          {
            segment_index: 1,
            segment_type: "single",
            purpose: "main",
            rounds: 1,
            items: [
              {
                ex_id: "ex1",
                sets: 3,
                reps_prescribed: "8",
                rest_after_set_sec: 60,
              },
            ],
          },
        ],
      },
    ],
  };
}

function parseSegRow(rows) {
  const segRow = rows.find((row) => row.startsWith("SEG|"));
  assert.ok(segRow, "expected a SEG row");
  const cols = segRow.split("|");
  return {
    segment_duration_seconds: Number(cols[10]),
    segment_duration_mmss: cols[11],
  };
}

function mmssToSeconds(mmss) {
  const parts = String(mmss || "").split(":");
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return NaN;
  return m * 60 + s;
}

test("roundSegmentDurationSeconds rounds to nearest minute", () => {
  assert.equal(roundSegmentDurationSeconds(542), 540);
  assert.equal(roundSegmentDurationSeconds(571), 600);
  assert.equal(roundSegmentDurationSeconds(89), 60);
  assert.equal(roundSegmentDurationSeconds(29), 0);
});

test("roundSegmentDurationSeconds guards invalid and negative inputs", () => {
  assert.equal(roundSegmentDurationSeconds(null), 0);
  assert.equal(roundSegmentDurationSeconds(undefined), 0);
  assert.equal(roundSegmentDurationSeconds(Number.NaN), 0);
  assert.equal(roundSegmentDurationSeconds(-20), 0);
});

test("emitPlanRows writes minute-rounded SEG duration and matching MM:SS", async () => {
  const out = await emitPlanRows({ program: makeProgram(10) });
  const seg = parseSegRow(out.rows);

  assert.equal(seg.segment_duration_seconds, 600);
  assert.equal(seg.segment_duration_mmss, "10:00");
  assert.equal(mmssToSeconds(seg.segment_duration_mmss), seg.segment_duration_seconds);
  assert.equal(seg.segment_duration_mmss.endsWith(":00"), true);
});

