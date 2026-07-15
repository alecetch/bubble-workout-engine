import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgeGroupBackfillPairs,
  sexCodeForDivisionCategory,
} from "../ageGroupBackfill.js";
import { HYROX_SCRAPER_DIVISIONS } from "../doublesScraper.js";

const EXPECTED_SEX_CODES = Object.freeze({
  open_male: "M",
  open_female: "W",
  pro_male: "M",
  pro_female: "W",
  doubles_male: "M",
  doubles_female: "W",
  doubles_mixed: "X",
  pro_doubles_male: "M",
  pro_doubles_female: "W",
  pro_doubles_mixed: "X",
  team_relay_male: "M",
  team_relay_female: "W",
  team_relay_mixed: "X",
});

describe("age-group backfill division sex classification", () => {
  it("classifies every scraper division explicitly", () => {
    assert.deepEqual(
      Object.keys(EXPECTED_SEX_CODES).sort(),
      [...HYROX_SCRAPER_DIVISIONS].sort(),
    );

    for (const division of HYROX_SCRAPER_DIVISIONS) {
      assert.equal(sexCodeForDivisionCategory(division), EXPECTED_SEX_CODES[division]);
    }
  });

  it("does not silently default unrecognized divisions to female", () => {
    assert.throws(
      () => sexCodeForDivisionCategory("future_adaptive_nonbinary"),
      /Unknown HYROX division category/,
    );
  });

  it("builds distinct contest-season-sex pairs after canonical classification", () => {
    const pairs = buildAgeGroupBackfillPairs([
      { source_contest_id: "CONTEST_1", season: 9, division_category: "open_male" },
      { source_contest_id: "CONTEST_1", season: 9, division_category: "pro_male" },
      { source_contest_id: "CONTEST_1", season: 9, division_category: "doubles_mixed" },
      { source_contest_id: "CONTEST_2", season: 9, division_category: "pro_doubles_female" },
    ]);

    assert.deepEqual(pairs, [
      { source_contest_id: "CONTEST_1", season: 9, sex_code: "M" },
      { source_contest_id: "CONTEST_1", season: 9, sex_code: "X" },
      { source_contest_id: "CONTEST_2", season: 9, sex_code: "W" },
    ]);
  });

  it("rejects unrecognized divisions while building backfill pairs", () => {
    assert.throws(
      () => buildAgeGroupBackfillPairs([
        { source_contest_id: "CONTEST_1", season: 9, division_category: "new_future_division" },
      ]),
      /Unknown HYROX division category/,
    );
  });
});
