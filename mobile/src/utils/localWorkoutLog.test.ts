import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  _resetForTest,
  getDayStatus,
  getSegmentLog,
  getWorkoutComplete,
  hasAnySegmentLog,
  setSegmentLog,
  setWorkoutComplete,
} from "./localWorkoutLog.js";

beforeEach(() => {
  _resetForTest();
});

test("getSegmentLog returns null when nothing has been written", async () => {
  assert.equal(await getSegmentLog("day-a7-1", "segment-a"), null);
});

test("getSegmentLog returns stored entry after setSegmentLog", async () => {
  await setSegmentLog("day-a7-2", "segment-a", { load: 80, rounds: 3, notes: "Strong" });
  const entry = await getSegmentLog("day-a7-2", "segment-a");
  assert.equal(entry?.load, 80);
  assert.equal(entry?.rounds, 3);
  assert.equal(entry?.notes, "Strong");
});

test("setSegmentLog persists load rounds notes and updatedAt", async () => {
  const entry = await setSegmentLog("day-a7-3", "segment-a", { load: 60, rounds: 2, notes: "Steady" });
  assert.equal(entry.load, 60);
  assert.equal(entry.rounds, 2);
  assert.equal(entry.notes, "Steady");
  assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("setSegmentLog overwrites an existing entry", async () => {
  await setSegmentLog("day-a7-4", "segment-a", { load: 60, rounds: 2, notes: "First" });
  await setSegmentLog("day-a7-4", "segment-a", { load: 70, rounds: 4, notes: "Second" });
  const entry = await getSegmentLog("day-a7-4", "segment-a");
  assert.equal(entry?.load, 70);
  assert.equal(entry?.rounds, 4);
  assert.equal(entry?.notes, "Second");
});

test("getWorkoutComplete defaults to false", async () => {
  assert.equal(await getWorkoutComplete("day-a7-5"), false);
});

test("setWorkoutComplete(true) makes getWorkoutComplete return true", async () => {
  await setWorkoutComplete("day-a7-6", true);
  assert.equal(await getWorkoutComplete("day-a7-6"), true);
});

test("setWorkoutComplete(false) makes getWorkoutComplete return false", async () => {
  await setWorkoutComplete("day-a7-7", true);
  await setWorkoutComplete("day-a7-7", false);
  assert.equal(await getWorkoutComplete("day-a7-7"), false);
});

test("hasAnySegmentLog returns false when no logs exist", async () => {
  assert.equal(await hasAnySegmentLog("day-a7-8", ["segment-a", "segment-b"]), false);
});

test("hasAnySegmentLog returns true after one segment is logged", async () => {
  await setSegmentLog("day-a7-9", "segment-b", { load: 50 });
  assert.equal(await hasAnySegmentLog("day-a7-9", ["segment-a", "segment-b"]), true);
});

test("hasAnySegmentLog returns false for empty segment ids", async () => {
  assert.equal(await hasAnySegmentLog("day-a7-10", []), false);
});

test("getDayStatus returns scheduled with no data", async () => {
  assert.equal(await getDayStatus("day-a7-11", ["segment-a"]), "scheduled");
});

test("getDayStatus returns started after setSegmentLog", async () => {
  await setSegmentLog("day-a7-12", "segment-a", { load: 40 });
  assert.equal(await getDayStatus("day-a7-12", ["segment-a"]), "started");
});

test("getDayStatus returns complete after setWorkoutComplete(true)", async () => {
  await setWorkoutComplete("day-a7-13", true);
  assert.equal(await getDayStatus("day-a7-13", ["segment-a"]), "complete");
});
