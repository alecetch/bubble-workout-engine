import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDoublesAnalysisDivision } from "../../hyrox/config/divisionGroups.js";
import { analyseRaceEvent } from "../raceEventAnalyser.js";
import { normaliseDivisionType } from "../hyroxScraper.js";

describe("normaliseDivisionType", () => {
  it("uses canonical word order for pro-doubles and mixed-doubles labels", () => {
    assert.equal(normaliseDivisionType("HYROX PRO Doubles Men"), "pro_doubles");
    assert.equal(normaliseDivisionType("HYROX Pro Double Women"), "pro_doubles");
    assert.equal(normaliseDivisionType("HYROX Mixed Doubles"), "doubles_mixed");
  });

  it("feeds scraped pro-doubles labels into benchmark-aware analysis as canonical doubles divisions", async () => {
    const division = normaliseDivisionType("HYROX PRO Doubles Men");
    let queryParams = null;
    const db = {
      async query(_sql, params) {
        queryParams = params;
        return { rows: [] };
      },
    };

    const analysis = await analyseRaceEvent([{
      rank: 1,
      name: "Smith, Alice & Jones, Bob",
      finishTimeSeconds: 3600,
      splits: {},
      roxzoneSplits: {},
    }], division, "male", db);

    assert.equal(queryParams?.[0], "pro_doubles");
    assert.equal(queryParams?.[1], "male");
    assert.equal(analysis.division, "pro_doubles");
    assert.equal(isDoublesAnalysisDivision(analysis.division), true);
  });
});
