import test from "node:test";
import assert from "node:assert/strict";
import { computeLifecycleState } from "../todayLifecycle.js";

const today = "2026-04-15";

test("returns no_program when resolvedProgramId is null", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: null,
      calendarDays: [],
      dayStatusByProgramDayId: {},
      todayIso: today,
    }),
    "no_program",
  );
});

test("returns today_scheduled when today is a training day not yet complete", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [{ calendarDate: today, isTrainingDay: true, programDayId: "d1" }],
      dayStatusByProgramDayId: {},
      todayIso: today,
    }),
    "today_scheduled",
  );
});

test("returns today_complete when today's day status is complete", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [{ calendarDate: today, isTrainingDay: true, programDayId: "d1" }],
      dayStatusByProgramDayId: { d1: "complete" },
      todayIso: today,
    }),
    "today_complete",
  );
});

test("returns today_rest when no training day matches today's date", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [{ calendarDate: "2026-04-16", isTrainingDay: true, programDayId: "d2" }],
      dayStatusByProgramDayId: {},
      todayIso: today,
    }),
    "today_rest",
  );
});

test("returns program_complete when all training days are complete", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [
        { calendarDate: "2026-04-10", isTrainingDay: true, programDayId: "d1" },
        { calendarDate: "2026-04-12", isTrainingDay: true, programDayId: "d2" },
      ],
      dayStatusByProgramDayId: { d1: "complete", d2: "complete" },
      todayIso: today,
    }),
    "program_complete",
  );
});

test("returns today_rest (not program_complete) when some training days are incomplete", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [
        { calendarDate: "2026-04-10", isTrainingDay: true, programDayId: "d1" },
        { calendarDate: "2026-04-20", isTrainingDay: true, programDayId: "d2" },
      ],
      dayStatusByProgramDayId: { d1: "complete" },
      todayIso: today,
    }),
    "today_rest",
  );
});

test("ignores non-training calendar days when computing program_complete", () => {
  assert.equal(
    computeLifecycleState({
      resolvedProgramId: "p1",
      calendarDays: [
        { calendarDate: "2026-04-10", isTrainingDay: true, programDayId: "d1" },
        { calendarDate: "2026-04-11", isTrainingDay: false, programDayId: null },
      ],
      dayStatusByProgramDayId: { d1: "complete" },
      todayIso: today,
    }),
    "program_complete",
  );
});
