import test from "node:test";
import assert from "node:assert/strict";
import { streakCopy } from "./streakCopy.js";

test("returns start copy for 0 streak", () => {
  assert.equal(streakCopy(0), "Start your streak today.");
});

test("returns singular for streak of 1", () => {
  assert.equal(streakCopy(1), "1 session down. Keep it going.");
});

test("returns momentum copy for streaks 2-4", () => {
  assert.ok(streakCopy(3).includes("Good momentum."));
});

test("returns strong copy for streaks 5-9", () => {
  assert.ok(streakCopy(7).includes("strong"));
});

test("returns building copy for streaks 10-19", () => {
  assert.ok(streakCopy(15).includes("building something real"));
});

test("returns elite copy for streaks 20+", () => {
  assert.ok(streakCopy(25).includes("Elite"));
});
