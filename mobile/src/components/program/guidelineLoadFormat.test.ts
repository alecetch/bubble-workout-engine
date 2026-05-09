import test from "node:test";
import assert from "node:assert/strict";
import { formatGuidelineValue } from "./guidelineLoadFormat";

test("formatGuidelineValue returns kg string for the default unit", () => {
  assert.equal(formatGuidelineValue({ value: 100, unit: "kg" }), "100 kg");
});

test("formatGuidelineValue returns 'Bodyweight' for bodyweight unit (value ignored)", () => {
  assert.equal(formatGuidelineValue({ value: 0, unit: "bodyweight" }), "Bodyweight");
});

test("formatGuidelineValue returns per-hand string for kg_per_hand", () => {
  assert.equal(formatGuidelineValue({ value: 20, unit: "kg_per_hand" }), "20 kg / hand");
});

test("formatGuidelineValue returns per-side string for kg_per_side", () => {
  assert.equal(formatGuidelineValue({ value: 15, unit: "kg_per_side" }), "15 kg / side");
});
