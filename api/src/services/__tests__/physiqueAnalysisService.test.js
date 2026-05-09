import test from "node:test";
import assert from "node:assert/strict";
import { normaliseAnalysis } from "../physiqueAnalysisService.js";

test("valid analysis object is normalised correctly", () => {
  const raw = {
    observations: ["Good quad sweep", "Visible rear deltoid"],
    comparison_notes: "Upper back appears wider than 4 weeks ago",
    emphasis_suggestions: ["quads", "upper_back"],
    disclaimer: "ignored - normaliser overwrites it",
  };
  const result = normaliseAnalysis(raw);
  assert.deepEqual(result.observations, ["Good quad sweep", "Visible rear deltoid"]);
  assert.equal(result.comparison_notes, "Upper back appears wider than 4 weeks ago");
  assert.deepEqual(result.emphasis_suggestions, ["quads", "upper_back"]);
  assert.ok(result.disclaimer.includes("AI-generated"));
});

test("invalid emphasis slugs are filtered out", () => {
  const raw = {
    observations: [],
    comparison_notes: null,
    emphasis_suggestions: ["quads", "not_a_real_slug", "chest", "SHOULDERS"],
    disclaimer: "",
  };
  const result = normaliseAnalysis(raw);
  assert.deepEqual(result.emphasis_suggestions, ["quads", "chest"]);
});

test("malformed input returns safe defaults", () => {
  const result = normaliseAnalysis({});
  assert.deepEqual(result.observations, []);
  assert.equal(result.comparison_notes, null);
  assert.deepEqual(result.emphasis_suggestions, []);
  assert.ok(result.disclaimer.length > 0);
});

test("observations are capped at 4 items", () => {
  const raw = {
    observations: ["a", "b", "c", "d", "e", "f"],
    comparison_notes: null,
    emphasis_suggestions: [],
  };
  const result = normaliseAnalysis(raw);
  assert.equal(result.observations.length, 4);
});

test("emphasis_suggestions capped at 3 items", () => {
  const raw = {
    observations: [],
    comparison_notes: null,
    emphasis_suggestions: ["quads", "chest", "glutes", "core"],
  };
  const result = normaliseAnalysis(raw);
  assert.equal(result.emphasis_suggestions.length, 3);
});
