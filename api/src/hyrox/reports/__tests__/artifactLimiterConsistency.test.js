import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCaption } from "../../sharePack/captionBuilder.js";
import { buildBrowserSummary } from "../browserSummaryBuilder.js";
import { buildCarouselPage } from "../carouselPageBuilder.js";
import { buildEmailReport } from "../emailReportBuilder.js";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildRaceCardHtml } from "../raceCardBuilder.js";
import { buildPersonalReport } from "../personalReportBuilder.js";
import { buildTemplateA } from "../templateSlotMapper.js";
import { screen4Boxes } from "../../../routes/adminHyroxTestHarness.js";

function tieBreakAnalysis() {
  return {
    race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
    athlete: { division: "open" },
    benchmarkContext: {
      goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
      primaryBenchmarkGroup: { label: "Open Male" },
      achievedBand: "sub_65",
    },
    headline: {
      biggestLimiter: {
        segmentKey: "wall_balls",
        label: "Wall Balls",
        type: "station",
        timeGapSeconds: 105,
        percentile: 60,
      },
    },
    timePotential: { headlineGainSeconds: 105 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4361, frameGapSeconds: 761, percentile: 45 },
      { segmentKey: "sled_push", type: "station", label: "Sled Push", userSeconds: 420, frameGapSeconds: 95, timeGapToMedianSeconds: 95, percentile: 30, confidence: "high" },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 430, frameGapSeconds: 105, timeGapToMedianSeconds: 105, percentile: 60, confidence: "high" },
    ],
    penalties: [],
  };
}

function strengthConsistencyAnalysis(overrides = {}) {
  return {
    race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
    athlete: { division: "open" },
    benchmarkContext: {
      goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
      primaryBenchmarkGroup: { label: "Open Male" },
      achievedBand: "sub_65",
    },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
      biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 88 },
    },
    strengths: [{ segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", userSeconds: 240, frameGapSeconds: -60, timeGapToMedianSeconds: -60, percentile: 88 }],
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 }],
    timePotential: { headlineGainSeconds: 90 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4361, frameGapSeconds: 761, percentile: 45 },
      { segmentKey: "farmers_carry", type: "station", label: "Farmers Carry", userSeconds: 240, frameGapSeconds: -60, timeGapToMedianSeconds: -60, percentile: 88, confidence: "high" },
      { segmentKey: "ski_erg", type: "station", label: "SkiErg", userSeconds: 300, frameGapSeconds: -30, timeGapToMedianSeconds: -30, percentile: 80, confidence: "high" },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 430, frameGapSeconds: 90, timeGapToMedianSeconds: 90, percentile: 35, confidence: "high" },
    ],
    penalties: [],
    ...overrides,
  };
}

function interpretation() {
  return {
    primaryThesis: { category: "station_capacity", confidence: "high" },
    sectionOrder: [],
    summaryBullets: [],
    secondaryTheses: [],
  };
}

function personalStrengthContent(analysisJson, athleteContext = {}) {
  const report = buildPersonalReport(analysisJson, [], athleteContext, interpretation(), "target");
  return report.sections.find((section) => section.sectionKey === "biggest_strength")?.content ?? "";
}

function assertNoBlankCopy(value) {
  const text = String(value ?? "");
  assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\(\s*\)/i);
}

describe("HYROX artifact limiter consistency", () => {
  it("names the largest seconds-gap limiter across email, carousel, race card, and caption", () => {
    const analysisJson = tieBreakAnalysis();
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };

    const email = buildEmailReport({ sections: [] }, analysisJson, athleteContext, interpretation, "target");
    const carousel = buildTemplateA(analysisJson, [], athleteContext);
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext, analysisJson });

    assert.match(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH THE WALL BALLS STATION/i);
    assert.doesNotMatch(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH SLED PUSH/i);
    assert.equal(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[3].station, "WALL BALLS");
    assert.equal(raceCard.biggestLimiter.name, "Wall Balls");
    assert.match(caption, /Biggest opportunity: WALL BALLS/);
    assert.doesNotMatch(caption, /Biggest opportunity: SLED PUSH/);
  });

  it("keeps target-mode email narrative aligned with subject, race card, carousel, and training focus", () => {
    const analysisJson = strengthConsistencyAnalysis({
      race: { finishTimeSeconds: 3574, targetTimeSeconds: 3300 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 34, percentile: 42 },
        biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 88 },
      },
      limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 34, percentile: 42 }],
      timePotential: { headlineGainSeconds: 34 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 3574, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300, frameGapSeconds: 274, percentile: 55, confidence: "high" },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1750, goalBenchmarkSeconds: 1580, exactTargetSeconds: 1580, frameGapSeconds: 170, percentile: 48, confidence: "high" },
        { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 1580, goalBenchmarkSeconds: 1510, exactTargetSeconds: 1510, frameGapSeconds: 70, percentile: 62, confidence: "high" },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 244, goalBenchmarkSeconds: 180, exactTargetSeconds: 180, frameGapSeconds: 64, timeGapToExactTargetSeconds: 64, percentile: 40, confidence: "high" },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 334, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, frameGapSeconds: 34, timeGapToExactTargetSeconds: 34, percentile: 42, confidence: "high" },
      ],
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3300 };
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysisJson.segments, benchmarkContext: analysisJson.benchmarkContext },
    };
    const recommendationsSection = {
      sectionKey: "recommended_focus_areas",
      title: "Recommended Focus Areas",
      content: ["Training focus:"],
      richRecommendations: [{ title: "RoxZone focus", category: "Execution" }],
    };

    const email = buildEmailReport({ sections: [splitSection, recommendationsSection] }, analysisJson, athleteContext, interpretation(), "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);

    assert.match(email.subject, /start with Wall Balls/i);
    assert.match(email.htmlBody, /The Wall Balls station is the main target opportunity/i);
    assert.doesNotMatch(email.htmlBody, /RoxZone[^.]*biggest target opportunity/i);
    assert.match(email.htmlBody, /Wall Balls under fatigue/i);
    assert.doesNotMatch(email.htmlBody, /RoxZone execution/i);
    assert.equal(raceCard.biggestLimiter.name, "Wall Balls");
    assert.equal(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[3].station, "WALL BALLS");
  });

  it("names the same reliable strongest station across browser, race card, carousel, and report sections", () => {
    const analysisJson = strengthConsistencyAnalysis();
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const browser = buildBrowserSummary(analysisJson, [], athleteContext, "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);
    const personalStrength = personalStrengthContent(analysisJson, athleteContext);

    assert.equal(browser.biggestStrength.label, "Farmers Carry");
    assert.equal(raceCard.strongestStation.name, "Farmers Carry");
    assert.equal(carousel.slides[0].best_station, "FARMERS CARRY");
    assert.equal(carousel.slides[2].station, "FARMERS CARRY");
    assert.match(personalStrength, /Farmers Carry is the strongest benchmarked area/i);
  });

  it("uses a contract-owned best-relative-split fallback when strict strength is null", () => {
    const analysisJson = strengthConsistencyAnalysis({
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
        biggestStrength: null,
      },
      strengths: [],
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const browser = buildBrowserSummary(analysisJson, [], athleteContext, "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);
    const personalStrength = personalStrengthContent(analysisJson, athleteContext);
    const browserMarkdown = screen4Boxes(browser, "target");

    assert.equal(browser.biggestStrength, null);
	    assert.equal(raceCard.strongestStation.name, "Farmers Carry");
	    assert.equal(raceCard.strongestStation.policyStatus, "fastest_ahead_split_only");
	    assert.equal(raceCard.strongestStation.percentile, null);
	    assert.equal(carousel.slides[0].best_station, "FARMERS CARRY");
	    assert.equal(carousel.slides[2].station, "FARMERS CARRY");
	    assert.ok(carousel.slides[5].features.includes("Best Relative Split"));
	    assert.ok(!carousel.slides[5].features.includes("Strongest Station"));
	    assert.match(carousel.slides[2].caption, /no protectable strength/i);
    assert.doesNotMatch(`${carousel.slides[0].best_station} ${carousel.slides[2].station} ${carousel.slides[2].caption}`, /SKIERG|SkiErg/);
    assert.match(personalStrength, /No single high-confidence strength dominated this result/i);
    assertNoBlankCopy(browserMarkdown);
    assertNoBlankCopy(JSON.stringify({
      best_station: carousel.slides[0].best_station,
      strength_station: carousel.slides[2].station,
      strength_percentile: carousel.slides[2].percentile,
      strength_caption: carousel.slides[2].caption,
    }));
  });

  it("omits the Best Relative Split card entirely when every split is slower than the comparison (no ahead split at all)", () => {
    // Every station gap below is positive (slower) - there is no negative-gap split anywhere
    // for either resolveReportStrength() or the fastestAheadSplit fallback to pick up, so
    // buildStrengthPolicy should fall all the way through to "no_reliable_strength".
    const analysisJson = strengthConsistencyAnalysis({
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
        biggestStrength: null,
      },
      strengths: [],
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4361, frameGapSeconds: 761, percentile: 45 },
        { segmentKey: "farmers_carry", type: "station", label: "Farmers Carry", userSeconds: 300, frameGapSeconds: 20, timeGapToMedianSeconds: 20, percentile: 40, confidence: "high" },
        { segmentKey: "ski_erg", type: "station", label: "SkiErg", userSeconds: 330, frameGapSeconds: 30, timeGapToMedianSeconds: 30, percentile: 38, confidence: "high" },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 430, frameGapSeconds: 90, timeGapToMedianSeconds: 90, percentile: 35, confidence: "high" },
      ],
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const html = buildRaceCardHtml(raceCard);

    assert.equal(raceCard.strongestStation, null, "no split is ahead of the comparison, so there is no best-relative-split fallback either");
    assert.ok(raceCard.biggestLimiter, "the biggest limiter card should still be present");
    assert.doesNotMatch(html, /Best Relative Split/i);
    assert.doesNotMatch(html, /Strongest Station/i);
    assert.match(html, /Biggest Limiter|Directional Opportunity/i, "the limiter card should still render on its own");
    // A single flex card with flex:1 stretches to fill the row - confirm there is exactly
    // one insight card in the row rather than an empty placeholder alongside it.
    assert.equal((html.match(/class="card (cy-card|am-card)"/g) ?? []).length, 1);
  });

  it("does not use a missing headline strength row and falls back to the contract best relative split", () => {
    const analysisJson = strengthConsistencyAnalysis({
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
        biggestStrength: { segmentKey: "ski_erg", label: "SkiErg", type: "station", percentile: 88 },
      },
      strengths: [],
      segments: strengthConsistencyAnalysis().segments.filter((row) => row.segmentKey !== "ski_erg"),
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const browser = buildBrowserSummary(analysisJson, [], athleteContext, "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);

    assert.equal(browser.biggestStrength, null);
    assert.equal(raceCard.strongestStation.name, "Farmers Carry");
    assert.equal(raceCard.strongestStation.policyStatus, "fastest_ahead_split_only");
    assert.equal(carousel.slides[0].best_station, "FARMERS CARRY");
    assert.equal(carousel.slides[2].station, "FARMERS CARRY");
  });

  it("keeps a strength when percentiles are unavailable but benchmark gaps are available", () => {
    const analysisJson = strengthConsistencyAnalysis({
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: null },
        biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: null },
      },
      strengths: [{ segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", userSeconds: 240, frameGapSeconds: -45, timeGapToMedianSeconds: -45, percentile: null }],
      segments: strengthConsistencyAnalysis().segments.map((row) => row.segmentKey === "farmers_carry"
        ? { ...row, frameGapSeconds: -45, timeGapToMedianSeconds: -45, percentile: null }
        : { ...row, percentile: row.segmentKey === "total_time" ? row.percentile : null }),
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const browser = buildBrowserSummary(analysisJson, [], athleteContext, "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);

    assert.equal(browser.biggestStrength.label, "Farmers Carry");
    assert.equal(browser.biggestStrength.summaryText, "Ahead by 0:45");
    assert.equal(raceCard.strongestStation.name, "Farmers Carry");
    assert.equal(raceCard.strongestStation.percentile, "Ahead by 0:45");
    assert.equal(carousel.slides[2].station, "FARMERS CARRY");
    assert.equal(carousel.slides[2].position_gain, "+0:45");
  });

  it("adds a confidence cue to strength surfaces when split timing is partial", () => {
    const analysisJson = strengthConsistencyAnalysis({
      dataQuality: { warnings: ["partial_split_data"], inputCompleteness: 0.82, confidence: "medium" },
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };

    const browser = buildBrowserSummary(analysisJson, [], athleteContext, "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);
    const raceCardHtml = buildRaceCardHtml(raceCard);

    assert.match(browser.dataQualityNote, /missing.*directional|directional.*missing/i);
    assert.match(browser.biggestStrength.dataQualityNote, /directional/i);
    assert.match(raceCard.strongestStation.caption, /directional/i);
    assert.match(carousel.slides[2].data_quality_note, /directional/i);
    assertNoBlankCopy(raceCardHtml);
  });

  it("uses RoxZone consistently across subject, training focus, race card, and carousel", () => {
    const analysisJson = strengthConsistencyAnalysis({
      headline: {
        biggestLimiter: { segmentKey: "roxzone_time", label: "Total Roxzone Time", type: "aggregate", timeGapSeconds: 376, percentile: 20 },
        biggestStrength: null,
      },
      timePotential: { headlineGainSeconds: 376 },
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 520,
        timeGapToMedianSeconds: 376,
        entryExitAvailable: true,
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4882, frameGapSeconds: 682, percentile: 45 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1800, frameGapSeconds: -20, percentile: 70 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2562, frameGapSeconds: 326, percentile: 35 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "Total Roxzone Time", userSeconds: 520, frameGapSeconds: 376, timeGapToMedianSeconds: 376, percentile: 20, confidence: "high" },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, timeGapToMedianSeconds: 90, percentile: 35, confidence: "high" },
        { segmentKey: "run_1", type: "run", label: "Run 1", userSeconds: 400, frameGapSeconds: 80, timeGapToMedianSeconds: 80, percentile: 35, confidence: "high" },
      ],
    });
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 4200 };
    const report = {
      sections: [{
        sectionKey: "recommended_focus_areas",
        title: "Recommended Focus Areas",
        content: ["Training focus:"],
        richRecommendations: [{ title: "Wall Balls focus", category: "Fitness" }],
      }],
    };

    const email = buildEmailReport(report, analysisJson, athleteContext, interpretation(), "target");
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const carousel = buildTemplateA(analysisJson, [], athleteContext);

    assert.match(email.subject, /start with RoxZone/i);
    assert.match(email.htmlBody, /RoxZone execution/i);
    assert.match(email.htmlBody, /Tighten RoxZone entry and exit flow/i);
    assert.doesNotMatch(email.htmlBody, /Total Roxzone Time capacity/i);
    assert.doesNotMatch(email.htmlBody, /Wall Balls under fatigue/i);
    assert.equal(raceCard.biggestLimiter.name, "RoxZone");
    assert.equal(carousel.slides[0].biggest_limiter, "ROXZONE");
    assert.equal(carousel.slides[3].station, "ROXZONE");
  });
});
