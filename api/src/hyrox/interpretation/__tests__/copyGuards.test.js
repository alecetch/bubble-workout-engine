import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoDuplicateSentences,
  assertNoOrdinalErrors,
  assertNoRawClockTimestamps,
  assertNoZeroOpportunityHero,
} from "../copyGuards.js";

test("passes for correct ordinals", () => {
  assert.doesNotThrow(() => assertNoOrdinalErrors("23rd place, 11th overall, 12th in division"));
});

test("throws for 23th", () => {
  assert.throws(() => assertNoOrdinalErrors("finished 23th"));
});

test("throws for 11st", () => {
  assert.throws(() => assertNoOrdinalErrors("ranked 11st"));
});

test("zero hero guard passes for non-zero gain", () => {
  assert.doesNotThrow(() => assertNoZeroOpportunityHero("<div>1:45</div>"));
});

test("zero hero guard throws for 0:00", () => {
  assert.throws(() => assertNoZeroOpportunityHero("<div>0:00</div>"));
});

test("duplicate guard passes when unique", () => {
  assert.doesNotThrow(() =>
    assertNoDuplicateSentences([
      { sectionKey: "a", content: "Run fade was 8%. You faded late." },
      { sectionKey: "b", content: "Station gaps were large." },
    ]),
  );
});

test("duplicate guard throws on duplicate sentence", () => {
  assert.throws(() =>
    assertNoDuplicateSentences([
      { sectionKey: "a", content: "Run fade was 8%." },
      { sectionKey: "b", content: "Run fade was 8%." },
    ]),
  );
});

test("clock guard passes for elapsed time", () => {
  assert.doesNotThrow(() => assertNoRawClockTimestamps("47 seconds into the transition"));
});

test("clock guard throws for raw HH:MM:SS", () => {
  assert.throws(() => assertNoRawClockTimestamps("Your slowest entry was at 20:18:12."));
});

