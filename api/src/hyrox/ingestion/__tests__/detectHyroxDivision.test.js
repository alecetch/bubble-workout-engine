import assert from "node:assert/strict";
import test from "node:test";
import { detectHyroxDivisionFromUrl } from "../detectHyroxDivision.js";

const BASE = "https://results.hyrox.com/season-8/";

// --- Singles ---

test("singles men: H_ event prefix + search[sex]=M", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=H_LR3MS4JI1682&search_event=H_LR3MS4JI1682&search[sex]=M`);
  assert.equal(result.raceFormat, "singles");
  assert.equal(result.divisionSex, "male");
  assert.equal(result.divisionLabel, "Singles Men");
  assert.equal(result.eventCode, "H_LR3MS4JI1682");
  assert.equal(result.eventPrefix, "H");
  assert.equal(result.sexParam, "M");
  assert.equal(result.source, "url_event_param");
});

test("singles women: H_ event prefix + search[sex]=W", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=H_LR3MS4JI1682&search[sex]=W`);
  assert.equal(result.raceFormat, "singles");
  assert.equal(result.divisionSex, "female");
  assert.equal(result.divisionLabel, "Singles Women");
  assert.equal(result.sexParam, "W");
});

test("singles women: search[sex]=F maps to female", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=H_LR3MS4JI1682&search[sex]=F`);
  assert.equal(result.raceFormat, "singles");
  assert.equal(result.divisionSex, "female");
  assert.equal(result.divisionLabel, "Singles Women");
  assert.equal(result.sexParam, "F");
});

// --- Doubles ---

test("men's doubles: HD_ event prefix + search[sex]=M", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=HD_LR3MS4JI1682&search[sex]=M`);
  assert.equal(result.raceFormat, "doubles");
  assert.equal(result.divisionSex, "male");
  assert.equal(result.divisionLabel, "Men's Doubles");
  assert.equal(result.eventPrefix, "HD");
  assert.equal(result.source, "url_event_param");
});

test("women's doubles: HD_ event prefix + search[sex]=W", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=HD_LR3MS4JI1682&search[sex]=W`);
  assert.equal(result.raceFormat, "doubles");
  assert.equal(result.divisionSex, "female");
  assert.equal(result.divisionLabel, "Women's Doubles");
});

test("mixed doubles: HD_ event prefix + search[sex]=X", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=HD_LR3MS4JI1682&search[sex]=X`);
  assert.equal(result.raceFormat, "doubles");
  assert.equal(result.divisionSex, "mixed");
  assert.equal(result.divisionLabel, "Mixed Doubles");
  assert.equal(result.sexParam, "X");
});

test("doubles unknown sex: HD_ event prefix without search[sex]", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=HD_LR3MS4JI1682`);
  assert.equal(result.raceFormat, "doubles");
  assert.equal(result.divisionSex, "unknown");
  assert.equal(result.divisionLabel, "Doubles");
  assert.equal(result.sexParam, null);
  assert.equal(result.source, "url_event_param");
});

// --- Edge cases ---

test("invalid URL returns unknown with source=invalid_url", () => {
  const result = detectHyroxDivisionFromUrl("not-a-url");
  assert.equal(result.raceFormat, "unknown");
  assert.equal(result.divisionSex, "unknown");
  assert.equal(result.divisionLabel, "Unknown");
  assert.equal(result.eventCode, null);
  assert.equal(result.eventPrefix, null);
  assert.equal(result.sexParam, null);
  assert.equal(result.source, "invalid_url");
});

test("valid URL with no event param returns unknown with source=no_event_param", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event_main_group=2025+London+Excel`);
  assert.equal(result.raceFormat, "unknown");
  assert.equal(result.eventCode, null);
  assert.equal(result.source, "no_event_param");
});

test("HD_ is not misclassified as singles despite starting with H", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=HD_SOME_CODE&search[sex]=M`);
  assert.equal(result.raceFormat, "doubles");
  assert.notEqual(result.raceFormat, "singles");
});

test("search_event used when event param is absent", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?search_event=H_ABC123&search[sex]=W`);
  assert.equal(result.raceFormat, "singles");
  assert.equal(result.divisionSex, "female");
  assert.equal(result.eventCode, "H_ABC123");
});

test("event param takes precedence over search_event", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=H_FIRST&search_event=HD_SECOND&search[sex]=M`);
  assert.equal(result.raceFormat, "singles");
  assert.equal(result.eventCode, "H_FIRST");
});

test("percent-encoded search[sex] param is resolved correctly", () => {
  const result = detectHyroxDivisionFromUrl(`${BASE}?event=H_ABC&search%5Bsex%5D=M`);
  assert.equal(result.divisionSex, "male");
  assert.equal(result.sexParam, "M");
});
