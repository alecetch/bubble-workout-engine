import test from "node:test";
import assert from "node:assert/strict";
import { formatGuidelineValue } from "../guidelineLoadFormat.js";

test("formats kg unit correctly", () => {
  assert.equal(
    formatGuidelineValue({ value: 80, unit: "kg" }),
    "80 kg",
  );
});

test("formats kg_per_hand unit correctly", () => {
  assert.equal(
    formatGuidelineValue({ value: 20, unit: "kg_per_hand" }),
    "20 kg / hand",
  );
});

test("formats bodyweight unit correctly", () => {
  assert.equal(
    formatGuidelineValue({ value: 0, unit: "bodyweight" }),
    "Bodyweight",
  );
});
