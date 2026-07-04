import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseListResultCount, parseListRows } from "../../../contentStudio/hyroxScraper.js";
import {
  buildResultRow,
  countAvailableDoublesRecords,
  discoverDoublesContestIds,
  enrichResultRowFromDetail,
  insertResultsBatch,
  validateAndFlagRow,
} from "../doublesScraper.js";

describe("parseListRows doubles markup", () => {
  it("parses relay member rows with flexible class ordering", () => {
    const html = `
      <ul class="list-group list-group-multicolumn">
        <li class="right list-group row list-group-item list-group-header">
          <div class="list-field field-place_all place-primary">Rank</div>
        </li>
        <li class="right list-group row list-group-item">
          <div class="list-field field-place_all place-primary">1</div>
          <div class="list-field type-relay_member field-__fullname">
            <a href="?content=detail&amp;idp=TEAM_123">Smith / Jones</a>
          </div>
          <div class="right list-field type-time field-time_finish_netto">
            <div class="visible-xs-block list-label">Total</div>01:02:03
          </div>
        </li>
        <li class="right list-group row list-group-item">
          <div class="list-field field-place_all place-primary">1</div>
          <div class="list-field type-relay_member field-__fullname">
            <a href="?content=detail&amp;idp=TEAM_123">Smith / Jones</a>
          </div>
          <div class="right list-field type-time field-time_finish_netto">
            <div class="visible-xs-block list-label">Total</div>01:02:03
          </div>
        </li>
      </ul>`;

    assert.deepEqual(parseListRows(html), [
      { rank: 1, name: "Smith / Jones", time: "01:02:03", athleteId: "TEAM_123" },
    ]);
  });

  it("parses HYROX result counts from the list header", () => {
    assert.equal(parseListResultCount('<span class="list-info__text str_num">1,810 Results</span>'), 1810);
    assert.equal(parseListResultCount('<span class="list-info__text str_num">0 Results | 0 Members</span>'), 0);
  });
});

function validRow(overrides = {}) {
  return {
    hyrox_event_id: 1,
    source_contest_id: "HDMM_ABC",
    source_athlete_id: "TEAM_1",
    division_category: "doubles_male",
    team_name: "Team One",
    overall_rank: 1,
    overall_time_seconds: 3600,
    ...overrides,
  };
}

describe("discoverDoublesContestIds", () => {
  it("returns selected doubles divisions", async () => {
    const result = await discoverDoublesContestIds("event", 9, ["doubles_male"], async () => [
      { label: "HYROX DOUBLES MEN", contestId: "HDMM_ABC" },
      { label: "HYROX PRO", contestId: "HPRO_ABC" },
    ]);

    assert.deepEqual(result.map((row) => [row.contestId, row.divisionCategory, row.sexCode]), [["HDMM_ABC", "doubles_male", "M"]]);
  });

  it("maps mixed before women", async () => {
    const result = await discoverDoublesContestIds("event", 9, ["doubles_mixed"], async () => [
      { label: "HYROX DOUBLES MIXED WOMEN", contestId: "HDX_ABC" },
    ]);

    assert.equal(result[0].divisionCategory, "doubles_mixed");
  });

  it("maps women to doubles_female", async () => {
    const result = await discoverDoublesContestIds("event", 9, ["doubles_female"], async () => [
      { label: "HYROX DOUBLES WOMEN", contestId: "HDF_ABC" },
    ]);

    assert.equal(result[0].divisionCategory, "doubles_female");
    assert.equal(result[0].sexCode, "W");
  });

  it("expands generic doubles labels across selected sex divisions and prefers non-pro doubles", async () => {
    const result = await discoverDoublesContestIds("event", 9, ["doubles_male", "doubles_female", "doubles_mixed"], async () => [
      { label: "HYROX PRO DOUBLES", contestId: "HDP_ABC" },
      { label: "HYROX DOUBLES", contestId: "HD_ABC" },
    ]);

    assert.deepEqual(result.slice(0, 3).map((row) => [row.contestId, row.divisionCategory, row.sexCode]), [
      ["HD_ABC", "doubles_male", "M"],
      ["HD_ABC", "doubles_female", "W"],
      ["HD_ABC", "doubles_mixed", "X"],
    ]);
  });

  it("prefers overall contests before day-level contests", async () => {
    const result = await discoverDoublesContestIds("event", 9, ["doubles_male"], async () => [
      { label: "HYROX DOUBLES - Friday", contestId: "HD_FRIDAY" },
      { label: "HYROX DOUBLES - Overall", contestId: "HD_OVERALL" },
    ]);

    assert.equal(result[0].contestId, "HD_OVERALL");
    assert.equal(result[0].isOverall, true);
  });

  it("maps singles, pro singles, pro doubles, and relay labels", async () => {
    const result = await discoverDoublesContestIds("event", 9, [
      "open_male",
      "open_female",
      "pro_male",
      "pro_doubles_female",
      "team_relay_mixed",
    ], async () => [
      { label: "HYROX MEN", contestId: "HOM_ABC" },
      { label: "HYROX WOMEN", contestId: "HOF_ABC" },
      { label: "HYROX PRO MEN", contestId: "HPM_ABC" },
      { label: "HYROX PRO DOUBLES WOMEN", contestId: "HPDF_ABC" },
      { label: "HYROX TEAM RELAY MIXED", contestId: "HTRX_ABC" },
    ]);

    assert.deepEqual(result.map((row) => [row.contestId, row.divisionCategory, row.sexCode]), [
      ["HOM_ABC", "open_male", "M"],
      ["HOF_ABC", "open_female", "W"],
      ["HPM_ABC", "pro_male", "M"],
      ["HPDF_ABC", "pro_doubles_female", "W"],
      ["HTRX_ABC", "team_relay_mixed", "X"],
    ]);
  });
});

describe("countAvailableDoublesRecords", () => {
  it("counts available rows across pages for selected divisions", async () => {
    const calls = [];
    const result = await countAvailableDoublesRecords("event", 9, ["doubles_male"], {
      interPageDelayMs: 0,
      divisionFetcher: async () => [{ label: "HYROX DOUBLES", contestId: "HD_ABC" }],
      pageFetcher: async (...args) => {
        calls.push(args);
        return '<span class="list-info__text str_num">52 Results</span>';
      },
      pageScraper: async () => {
        throw new Error("should not page when the result count is present");
      },
    });

    assert.equal(result.totalRecordsAvailable, 52);
    assert.equal(result.divisions[0].status, "available");
    assert.equal(result.divisions[0].pages, 2);
    assert.deepEqual(calls.map((call) => [call[1], call[3].sex, call[3].numResults, call[3].page]), [["HD_ABC", "M", 100, 1]]);
  });

  it("falls back to paging when a result count is unavailable", async () => {
    const calls = [];
    const result = await countAvailableDoublesRecords("event", 9, ["doubles_male"], {
      interPageDelayMs: 0,
      divisionFetcher: async () => [{ label: "HYROX DOUBLES", contestId: "HD_ABC" }],
      pageFetcher: async () => "<html></html>",
      pageScraper: async (...args) => {
        calls.push(args);
        const offset = args[3];
        if (offset === 0) return Array.from({ length: 50 }, (_, index) => ({ rank: index + 1 }));
        if (offset === 50) return [{ rank: 51 }, { rank: 52 }];
        return [];
      },
    });

    assert.equal(result.totalRecordsAvailable, 52);
    assert.equal(result.divisions[0].status, "available");
    assert.equal(result.divisions[0].pages, 2);
    assert.deepEqual(calls.map((call) => [call[1], call[3], call[4]]), [
      ["HD_ABC", 0, "M"],
      ["HD_ABC", 50, "M"],
    ]);
  });

  it("reports no_contest when no matching doubles division exists", async () => {
    const result = await countAvailableDoublesRecords("event", 9, ["doubles_mixed"], {
      divisionFetcher: async () => [{ label: "HYROX PRO", contestId: "HPRO_ABC" }],
      pageScraper: async () => {
        throw new Error("should not scrape pages without a contest");
      },
    });

    assert.equal(result.totalRecordsAvailable, 0);
    assert.equal(result.divisions[0].status, "no_contest");
  });

  it("checks availability for selected singles divisions", async () => {
    const result = await countAvailableDoublesRecords("event", 9, ["open_female"], {
      divisionFetcher: async () => [{ label: "HYROX WOMEN", contestId: "HOW_ABC" }],
      pageFetcher: async () => '<span class="list-info__text str_num">118 Results</span>',
    });

    assert.equal(result.totalRecordsAvailable, 118);
    assert.equal(result.divisions[0].divisionCategory, "open_female");
    assert.equal(result.divisions[0].sexCode, "W");
  });
});

describe("buildResultRow", () => {
  it("maps raw rows into doubles result shape", () => {
    const row = buildResultRow(
      { rank: 3, name: "Team Three", time: "1:02:03", athleteId: "T3" },
      10,
      "HDMM_X",
      "doubles_male",
      "job-1",
      { eventName: "HYROX London", city: "London", country: "GB", season: 9 },
    );

    assert.equal(row.hyrox_event_id, 10);
    assert.equal(row.overall_time_seconds, 3723);
    assert.equal(row.team_name, "Team Three");
    assert.equal(row.scrape_job_id, "job-1");
  });
});

describe("enrichResultRowFromDetail", () => {
  it("maps detail-page splits and roxzone replay rows onto doubles columns", () => {
    const detailHtml = `
      <div id="detail-box-other"><table>
        <tr class="f-time_01"><td class="f-time_01">00:04:00</td><td class="last">1</td></tr>
        <tr class="f-time_02"><td class="f-time_02">00:05:00</td><td class="last">2</td></tr>
        <tr class="f-time_11"><td class="f-time_11">00:03:00</td><td class="last">3</td></tr>
        <tr class="f-time_12"><td class="f-time_12">00:02:00</td><td class="last">4</td></tr>
        <tr class="f-time_49"><td class="f-time_49">00:09:00</td><td class="last">5</td></tr>
        <tr class="f-time_60"><td class="f-time_60">00:07:00</td><td class="last">6</td></tr>
      </table></div>
      <div id="detail-box-splits"><table>
        <tr class="f-time_85"><td>Station In</td><td>00:00:12</td></tr>
        <tr class="f-time_86"><td>Rox Out</td><td>00:00:18</td></tr>
      </table></div>`;
    const result = enrichResultRowFromDetail(validRow({ team_name: "Alice Example, Bob Example" }), detailHtml);

    assert.equal(result.athlete_1_name, "Alice Example");
    assert.equal(result.athlete_2_name, "Bob Example");
    assert.equal(result.run_total_seconds, 540);
    assert.equal(result.station_total_seconds, 300);
    assert.equal(result.roxzone_total_seconds, 420);
    assert.equal(result.split_run_1, 240);
    assert.equal(result.split_skierg, 180);
    assert.equal(result.rox_skierg_in, 12);
    assert.equal(result.rox_skierg_out, 18);
    assert.ok(result.split_coverage_score > 0);
    assert.equal(result.raw_payload_json.detail.roxzoneSeconds, 420);
  });

  it("keeps singles names as one athlete name", () => {
    const result = enrichResultRowFromDetail(validRow({
      source_contest_id: "HOM_ABC",
      division_category: "open_male",
      team_name: "Smith, Alex",
    }), "<html></html>");

    assert.equal(result.athlete_1_name, "Smith, Alex");
    assert.equal(result.athlete_2_name, null);
  });
});

describe("validateAndFlagRow", () => {
  it("invalidates missing overall time", () => {
    const result = validateAndFlagRow(validRow({ overall_time_seconds: null }));
    assert.equal(result.data_quality_status, "invalid");
    assert.ok(result.data_quality_flags.includes("invalid_overall_time"));
  });

  it("marks missing athlete id as partial", () => {
    const result = validateAndFlagRow(validRow({ source_athlete_id: null }));
    assert.equal(result.data_quality_status, "partial");
    assert.ok(result.data_quality_flags.includes("no_athlete_id"));
  });

  it("flags implausible times", () => {
    const result = validateAndFlagRow(validRow({ overall_time_seconds: 1000 }));
    assert.equal(result.data_quality_status, "partial");
    assert.ok(result.data_quality_flags.includes("implausible_time"));
  });

  it("accepts non-doubles contest ids for singles and pro categories", () => {
    const result = validateAndFlagRow(validRow({ source_contest_id: "HPRO_ABC", division_category: "pro_male" }));
    assert.equal(result.data_quality_status, "valid");
    assert.ok(!result.data_quality_flags.includes("not_doubles_event"));
  });

  it("marks clean rows as valid", () => {
    const result = validateAndFlagRow(validRow());
    assert.equal(result.data_quality_status, "valid");
    assert.deepEqual(result.data_quality_flags, []);
  });
});

describe("insertResultsBatch", () => {
  it("upserts rich rows and returns inserted and duplicate counts", async () => {
    const calls = [];
    const pool = {
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: [{ inserted: true }, { inserted: false }] };
      },
    };
    const result = await insertResultsBatch(pool, [
      validRow({ split_run_1: 300, roxzone_total_seconds: 420 }),
      validRow({ source_athlete_id: "TEAM_2", split_run_1: 320 }),
    ]);

    assert.equal(result.inserted, 1);
    assert.equal(result.duplicates, 1);
    assert.match(calls[0].sql, /ON CONFLICT[\s\S]*DO UPDATE/);
    assert.ok(calls[0].values.length > 40);
  });
});
