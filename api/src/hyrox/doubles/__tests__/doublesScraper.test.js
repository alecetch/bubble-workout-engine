import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAthleteAgeGroup, parseListResultCount, parseListRows } from "../../../contentStudio/hyroxScraper.js";
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
  it("paginates to count records when the full result spans multiple pages", async () => {
    const calls = [];
    const result = await countAvailableDoublesRecords("event", 9, ["doubles_male"], {
      interPageDelayMs: 0,
      divisionFetcher: async () => [{ label: "HYROX DOUBLES", contestId: "HD_ABC" }],
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

  it("counts correctly when all records fit on the first page", async () => {
    const result = await countAvailableDoublesRecords("event", 9, ["doubles_male"], {
      interPageDelayMs: 0,
      divisionFetcher: async () => [{ label: "HYROX DOUBLES", contestId: "HD_ABC" }],
      pageScraper: async (_, __, ___, offset) => {
        if (offset === 0) return Array.from({ length: 30 }, (_, index) => ({ rank: index + 1 }));
        return [];
      },
    });

    assert.equal(result.totalRecordsAvailable, 30);
    assert.equal(result.divisions[0].status, "available");
    assert.equal(result.divisions[0].pages, 1);
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
      interPageDelayMs: 0,
      divisionFetcher: async () => [{ label: "HYROX WOMEN", contestId: "HOW_ABC" }],
      pageScraper: async (_, __, ___, offset) => {
        if (offset === 0) return Array.from({ length: 50 }, (_, i) => ({ rank: i + 1 }));
        if (offset === 50) return Array.from({ length: 50 }, (_, i) => ({ rank: 51 + i }));
        if (offset === 100) return Array.from({ length: 18 }, (_, i) => ({ rank: 101 + i }));
        return [];
      },
    });

    assert.equal(result.totalRecordsAvailable, 118);
    assert.equal(result.divisions[0].divisionCategory, "open_female");
    assert.equal(result.divisions[0].sexCode, "W");
  });

  it("counts records across multiple sex-ambiguous contests for the same division", async () => {
    const result = await countAvailableDoublesRecords("event", 9, ["open_male", "open_female"], {
      interPageDelayMs: 0,
      divisionFetcher: async () => [
        { label: "HYROX - Saturday", contestId: "H_SAT" },
        { label: "HYROX - Sunday", contestId: "H_SUN" },
      ],
      pageScraper: async (_key, contestId, _season, offset, sexCode) => {
        if (contestId === "H_SAT") {
          if (sexCode === "M" && offset === 0) return Array.from({ length: 30 }, (_, i) => ({ rank: i + 1 }));
          return [];
        }
        if (contestId === "H_SUN") {
          if (sexCode === "W" && offset === 0) return Array.from({ length: 25 }, (_, i) => ({ rank: i + 1 }));
          return [];
        }
        return [];
      },
    });

    assert.equal(result.divisions.find((division) => division.divisionCategory === "open_male")?.recordsAvailable, 30);
    assert.equal(result.divisions.find((division) => division.divisionCategory === "open_female")?.recordsAvailable, 25);
    assert.equal(result.totalRecordsAvailable, 55);

    const maleDivision = result.divisions.find((division) => division.divisionCategory === "open_male");
    assert.deepEqual(maleDivision.contestIds, ["H_SAT", "H_SUN"]);
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

describe("parseAthleteAgeGroup", () => {
  it("extracts age group from f-_type_age_class CSS class on a td (standard HYROX pattern)", () => {
    const html = `<tr class=" f-_type_age_class"><th class="desc">Age Group</th><td class="f-_type_age_class last">25-29</td></tr>`;
    assert.equal(parseAthleteAgeGroup(html), "25-29");
  });

  it("extracts from f-_type_age_class when only the td carries the class", () => {
    const html = `<td class="f-_type_age_class last">35-39</td>`;
    assert.equal(parseAthleteAgeGroup(html), "35-39");
  });

  it("falls back to Age Group label row when CSS class is absent", () => {
    const html = `<tr><th>Age Group</th><td>40-44</td></tr>`;
    assert.equal(parseAthleteAgeGroup(html), "40-44");
  });

  it("falls back to Age Class label row (older season variant)", () => {
    const html = `<tr><td>Age Class</td><td>30-34</td></tr>`;
    assert.equal(parseAthleteAgeGroup(html), "30-34");
  });

  it("returns null when neither pattern is present", () => {
    assert.equal(parseAthleteAgeGroup("<html><body>No age info here</body></html>"), null);
  });

  it("returns null for elite events that have no age group field", () => {
    const html = `<tr class=" f-__fullname"><th>Name</th><td>Smith, John</td></tr><tr class="f-__nation"><th>Nat</th><td>USA</td></tr>`;
    assert.equal(parseAthleteAgeGroup(html), null);
  });
});

describe("enrichResultRowFromDetail", () => {
  it("maps detail-page splits and roxzone replay rows onto doubles columns", () => {
    const detailHtml = `
      <td class="f-_type_age_class last">35-39</td>
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
    assert.equal(result.age_group, "35-39");
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

  it("sets age_group to null when age class is absent from detail page", () => {
    const result = enrichResultRowFromDetail(validRow(), "<html></html>");
    assert.equal(result.age_group, null);
  });

  it("does not treat partial run splits as total running when official Run Total is missing", () => {
    const detailHtml = `
      <div id="detail-box-other"><table>
        <tr class="f-time_01"><td class="f-time_01">00:06:19</td><td class="last">-</td></tr>
        <tr class="f-time_11"><td class="f-time_11">00:05:29</td><td class="last">11</td></tr>
        <tr class="f-time_12"><td class="f-time_12">00:03:33</td><td class="last">12</td></tr>
        <tr class="f-time_13"><td class="f-time_13">00:07:30</td><td class="last">11</td></tr>
        <tr class="f-time_14"><td class="f-time_14">00:04:53</td><td class="last">8</td></tr>
        <tr class="f-time_15"><td class="f-time_15">00:06:09</td><td class="last">12</td></tr>
        <tr class="f-time_16"><td class="f-time_16">00:02:59</td><td class="last">12</td></tr>
        <tr class="f-time_17"><td class="f-time_17">00:07:34</td><td class="last">11</td></tr>
        <tr class="f-time_18"><td class="f-time_18">00:20:10</td><td class="last">12</td></tr>
        <tr class="f-time_49"><td class="f-time_49">-</td><td class="last">10</td></tr>
        <tr class="f-time_60"><td class="f-time_60">-</td><td class="last">-</td></tr>
      </table></div>`;
    const enriched = enrichResultRowFromDetail(validRow(), detailHtml);
    const validated = validateAndFlagRow(enriched);

    assert.equal(enriched.split_run_1, 379);
    assert.equal(enriched.run_total_seconds, null);
    assert.equal(validated.data_quality_status, "partial");
    assert.ok(validated.data_quality_flags.includes("incomplete_run_splits"));
    assert.ok(validated.data_quality_flags.includes("missing_run_total"));
  });

  it("sums running only when all eight run splits are present and official Run Total is missing", () => {
    const runRows = Array.from({ length: 8 }, (_, index) => {
      const cls = `f-time_0${index + 1}`;
      return `<tr class="${cls}"><td class="${cls}">00:05:00</td><td class="last">-</td></tr>`;
    }).join("");
    const detailHtml = `<div id="detail-box-other"><table>${runRows}</table></div>`;
    const result = enrichResultRowFromDetail(validRow(), detailHtml);

    assert.equal(result.run_total_seconds, 2400);
    assert.ok(!(result.data_quality_flags ?? []).includes("incomplete_run_splits"));
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

  it("de-duplicates rows with the same conflict key within a batch", async () => {
    const calls = [];
    const pool = {
      async query(sql, values) {
        calls.push({ sql, values });
        // Only one row reaches the DB after dedup
        return { rows: [{ inserted: true }] };
      },
    };
    // Two rows with identical (hyrox_event_id, source_contest_id, source_athlete_id)
    const result = await insertResultsBatch(pool, [
      validRow({ split_run_1: 300 }),
      validRow({ split_run_1: 310 }), // same conflict key — second wins
    ]);

    assert.equal(calls.length, 1);
    // Only 1 placeholder row sent to DB
    assert.equal(result.inserted, 1);
    // The intra-batch dupe is counted as a duplicate
    assert.equal(result.duplicates, 1);
  });

  it("counts intra-batch dupes and DB dupes together", async () => {
    const pool = {
      async query(_sql, _values) {
        // Both deduplicated rows already exist in DB
        return { rows: [{ inserted: false }, { inserted: false }] };
      },
    };
    // 3 rows: 2 unique keys + 1 intra-batch dupe
    const result = await insertResultsBatch(pool, [
      validRow({ split_run_1: 300 }),
      validRow({ split_run_1: 310 }), // dupe of row[0]
      validRow({ source_athlete_id: "TEAM_2", split_run_1: 320 }),
    ]);

    assert.equal(result.inserted, 0);
    assert.equal(result.duplicates, 3); // 1 intra-batch + 2 DB-level dupes
  });
});
