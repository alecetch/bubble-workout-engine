import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildRaceCardHtml } from "../raceCardBuilder.js";
import { buildTemplateA } from "../templateSlotMapper.js";

function fixtureData(overrides = {}) {
  return {
    athleteName: "Alex Smith",
    finishTime: "1:35:38",
    targetTime: "1:20:00",
    percentileText: "38th percentile",
    formaScore: 72,
    mode: "target",
    strongestStation: { name: "Sled Pull", percentile: "Ahead by 0:18" },
    biggestLimiter: { name: "Wall Balls", rankText: "+1:06 gap", potentialGain: "2:44" },
    splitRows: [
      { label: "Run 3", delta: "+0:32", tone: "negative" },
      { label: "Sled Push", delta: "+0:51", tone: "negative" },
      { label: "Sled Pull", delta: "-0:18", tone: "positive" },
      { label: "Burpee Broad Jump", delta: "+0:42", tone: "negative" },
      { label: "Row", delta: "-0:11", tone: "positive" },
      { label: "Farmers Carry", delta: "+0:24", tone: "negative" },
      { label: "Sandbag Lunges", delta: "+0:39", tone: "negative" },
      { label: "Wall Balls", delta: "+1:06", tone: "negative" },
      { label: "SkiErg", delta: "-0:09", tone: "positive" },
    ],
    isDoubles: false,
    ...overrides,
  };
}

function allRaceSplits() {
  return [
    "Run 1",
    "SkiErg",
    "Run 2",
    "Sled Push",
    "Run 3",
    "Sled Pull",
    "Run 4",
    "Burpee Broad Jump",
    "Run 5",
    "Row",
    "Run 6",
    "Farmers Carry",
    "Run 7",
    "Sandbag Lunges",
    "Run 8",
    "Wall Balls",
  ].map((label, index) => ({
    label,
    userTime: `${5 + Math.floor(index / 2)}:${String(10 + index).padStart(2, "0")}`,
    delta: index % 3 === 0 ? "-0:18" : `+0:${String(12 + index).padStart(2, "0")}`,
    tone: index % 3 === 0 ? "positive" : "negative",
  }));
}

function sectionBetween(html, start, end) {
  const startIndex = html.indexOf(start);
  assert.ok(startIndex >= 0, `missing start marker ${start}`);
  const endIndex = html.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `missing end marker ${end}`);
  return html.slice(startIndex, endIndex);
}

function mappedRaceCardHtmlForDivision(division) {
  const data = buildHyroxRaceCardData({
    athlete: {
      name: "Smith, Alice & Jones, Bob",
      division,
    },
    race: {
      finishTimeSeconds: 5738,
    },
    benchmarkContext: {
      comparisonOptions: [{ percentile: 72, topPercent: 28 }],
    },
  });

  assert.equal(data.isDoubles, true);
  return buildRaceCardHtml(data);
}

function assertDoublesNameSplit(html) {
  const athlete = sectionBetween(html, '<div class="slbl">Athlete</div>', '<div class="sdiv"></div>');

  assert.match(athlete, /<div class="sname"><span class="name-wh">ALICE<\/span> <span class="name-cy">SMITH<\/span><\/div>/);
  assert.match(athlete, /<div class="sname"><span class="name-wh">BOB<\/span> <span class="name-cy">JONES<\/span><\/div>/);
  assert.doesNotMatch(athlete, /<div class="sname"><span class="name-wh">ALICE<\/span><\/div>\s*<div class="sname"><span class="name-cy">SMITH &amp; JONES, BOB<\/span><\/div>/);
}

function dominantPenaltyAnalysis() {
  return {
    athlete: { name: "Alex Smith", division: "open" },
    race: { finishTimeSeconds: 5600, targetTimeSeconds: 5000 },
    benchmarkContext: {
      goalBenchmarkGroup: { targetFinishSeconds: 5000, label: "Target" },
    },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
    },
    timePotential: { headlineGainSeconds: 90 },
    penalties: [{ station: "run_5", penaltySeconds: 200 }],
    segments: [
      { segmentKey: "total_time", type: "aggregate", userSeconds: 5600, frameGapSeconds: 600, percentile: 45 },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 380, frameGapSeconds: 90, percentile: 35 },
    ],
  };
}

function confidenceCaveatAnalysis(benchmarkContextOverrides = {}) {
  return {
    athlete: { name: "Alex Smith", division: "open" },
    race: { finishTimeSeconds: 5738 },
    benchmarkContext: {
      comparisonOptions: [{ percentile: 96, topPercent: 4 }],
      ...benchmarkContextOverrides,
    },
    segments: [
      { segmentKey: "total_time", type: "aggregate", userSeconds: 5738, percentile: 96 },
    ],
  };
}

describe("buildRaceCardHtml asset-backed artwork", () => {
  it("renders the header hero as an image when the asset loads", () => {
    const html = buildRaceCardHtml(fixtureData());

    const header = sectionBetween(html, '<div class="header">', '<div class="hr"></div>');
    assert.match(header, /<img src="data:image\/jpeg;base64,/);
    assert.doesNotMatch(header, /id="rgl"/);
  });

  it("renders the strongest station card with a bundled image icon", () => {
    const html = buildRaceCardHtml(fixtureData({ strongestStation: { name: "Sled Pull", percentile: "Ahead by 0:18" } }));
    const card = sectionBetween(html, "Strongest Station", "YOU POWERED THROUGH HERE");

    assert.match(card, /<img src="data:image\/png;base64,/);
  });

  it("renders the biggest limiter card with a bundled image icon", () => {
    const html = buildRaceCardHtml(fixtureData({ biggestLimiter: { name: "Wall Balls", rankText: "+1:06 gap" } }));
    const card = sectionBetween(html, "Biggest Limiter", "THIS IS WHAT HELD YOU BACK");

    assert.match(card, /<img src="data:image\/png;base64,/);
  });

  it("falls back to the hand-drawn SVG icon when no station icon can resolve", () => {
    const html = buildRaceCardHtml(fixtureData({ strongestStation: { name: "", percentile: "Ahead by 0:18" } }));
    const card = sectionBetween(html, "Strongest Station", "YOU POWERED THROUGH HERE");

    assert.match(card, /<svg viewBox="0 0 80 80"/);
    assert.match(card, /<polygon points="40,4 72,22 72,58 40,76 8,58 8,22"/);
  });

  it("renders chart images for simple-icon stations, including Run and SkiErg", () => {
    const html = buildRaceCardHtml(fixtureData({
      splitRows: [
        { label: "Sled Push", delta: "+0:51", tone: "negative" },
        { label: "Run 3", delta: "+0:32", tone: "negative" },
        { label: "SkiErg", delta: "-0:09", tone: "positive" },
      ],
    }));

    assert.match(html, /<image data-station-icon="simple-sled-push\.png" href="data:image\/png;base64,/);
    assert.match(html, /<image data-station-icon="simple-running\.png" href="data:image\/png;base64,/);
    assert.match(html, /<image data-station-icon="simple-skierg\.png" href="data:image\/png;base64,/);
    assert.doesNotMatch(html, /data-station-icon="hex-running\.png"/);
    assert.doesNotMatch(html, /data-station-icon="hex-skierg\.png"/);
  });

  it("renders the full 16-event race split profile with split times", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));
    const splitProfile = sectionBetween(html, "Race Split Profile", '<div class="footer">');

    assert.equal((splitProfile.match(/data-station-icon=/g) ?? []).length, 16);
    assert.match(splitProfile, />5:10</);
    assert.match(splitProfile, />12:25</);
  });

  it("uses the Forma masthead lockup and drops the old tagline text", () => {
    const html = buildRaceCardHtml(fixtureData());

    assert.match(html, /alt="Forma — Measure\. Understand\. Improve\."/);
    assert.equal((html.match(/alt="Forma — Measure\. Understand\. Improve\."/g) ?? []).length, 2, "expected the masthead image in both header and footer");
    assert.equal(html.includes("PERFORMANCE ENGINEER"), false);
    assert.equal(html.includes("YOUR RACE"), false);
    assert.equal(html.includes("DECODED"), false);
    assert.match(html, /www\.getforma\.fit/);
    assert.doesNotMatch(html, /Data\. Insight\. Performance\./);
  });

  it("renders doubles athlete names as one athlete per line with surname accent colour", () => {
    const html = buildRaceCardHtml(fixtureData({
      athleteName: "Smith, Alice & Jones, Bob",
      isDoubles: true,
    }));

    assertDoublesNameSplit(html);
  });

  it("splits ampersand-joined athlete names even when doubles metadata is absent", () => {
    const html = buildRaceCardHtml(fixtureData({
      athleteName: "John Smith & Jane Doe",
      isDoubles: false,
    }));
    const athlete = sectionBetween(html, '<div class="slbl">Athlete</div>', '<div class="sdiv"></div>');

    assert.match(athlete, /<div class="sname"><span class="name-wh">JOHN<\/span> <span class="name-cy">SMITH<\/span><\/div>/);
    assert.match(athlete, /<div class="sname"><span class="name-wh">JANE<\/span> <span class="name-cy">DOE<\/span><\/div>/);
    assert.doesNotMatch(athlete, /SMITH &amp; JANE DOE/);
  });

  it("splits mapped pro-doubles and mixed-doubles athlete names into one athlete per line", () => {
    for (const division of ["pro_doubles_male", "mixed", "mixed_doubles"]) {
      assertDoublesNameSplit(mappedRaceCardHtmlForDivision(division));
    }
  });

  it("uses penalties as the race-card headline opportunity when penalties dominate the total gap", () => {
    const data = buildHyroxRaceCardData(dominantPenaltyAnalysis());
    const html = buildRaceCardHtml(data);

    assert.equal(data.biggestLimiter.name, "Penalties");
    assert.equal(data.biggestLimiter.potentialGain, "3:20");
    assert.equal(data.biggestLimiter.isPenalty, true);
    assert.equal(data.penaltySummary.value, "3:20");
    assert.match(html, /Biggest Opportunity/);
    assert.match(html, /<div class="card-title">Penalties<\/div>/);
    assert.match(html, /PENALTIES: 3:20/);
    assert.doesNotMatch(html, /<div class="card-title">Wall Balls<\/div>/);
  });

  it("renders a canonical RoxZone limiter from headline data", () => {
    const data = buildHyroxRaceCardData({
      athlete: { name: "Alex Smith", division: "open" },
      race: { finishTimeSeconds: 5738 },
      benchmarkContext: {
        comparisonOptions: [{ percentile: 72, topPercent: 28 }],
      },
      headline: {
        biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 200, percentile: 18 },
      },
      timePotential: { headlineGainSeconds: 200 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", userSeconds: 5738, percentile: 72 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 420, frameGapSeconds: 200, timeGapToMedianSeconds: 200, percentile: 18 },
        { segmentKey: "sled_pull", type: "station", label: "Sled Pull", userSeconds: 220, frameGapSeconds: 63, timeGapToMedianSeconds: 63, percentile: 35 },
      ],
    });
    const html = buildRaceCardHtml(data);

    assert.equal(data.biggestLimiter.name, "RoxZone");
    assert.equal(data.biggestLimiter.rankText, "+3:20 gap");
    assert.equal(data.biggestLimiter.potentialGain, "+3:20");
    assert.match(html, /<div class="card-title">RoxZone<\/div>/);
    assert.doesNotMatch(html, /<div class="card-title">Sled Pull<\/div>/);
  });

  it("labels split chart bars with the same comparison basis as the carousel", () => {
    const medianBasedAnalysis = {
      athlete: { name: "Alex Smith", division: "open" },
      race: { finishTimeSeconds: 5738 },
      benchmarkContext: {
        comparisonOptions: [{ percentile: 72, topPercent: 28 }],
      },
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 66, percentile: 18 },
        biggestStrength: { segmentKey: "sled_pull", label: "Sled Pull", type: "station", percentile: 88 },
      },
      timePotential: { headlineGainSeconds: 66 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", userSeconds: 5738, frameGapSeconds: 240, percentile: 72 },
        { segmentKey: "run_1", type: "run", label: "Run 1", userSeconds: 300, benchmarkMedianSeconds: 330, frameGapSeconds: -30, timeGapToMedianSeconds: -30, percentile: 76 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 386, benchmarkMedianSeconds: 320, frameGapSeconds: 66, timeGapToMedianSeconds: 66, percentile: 18 },
        { segmentKey: "sled_pull", type: "station", label: "Sled Pull", userSeconds: 170, benchmarkMedianSeconds: 190, frameGapSeconds: -20, timeGapToMedianSeconds: -20, percentile: 88 },
      ],
    };

    const raceCard = buildHyroxRaceCardData(medianBasedAnalysis);
    const carousel = buildTemplateA(medianBasedAnalysis, [], { displayName: "Alex Smith", calculatorMode: "analyse" });
    const html = buildRaceCardHtml(raceCard);

    assert.equal(raceCard.comparisonBasis, carousel.slides[1].comparison_basis);
    assert.equal(raceCard.comparisonBasis, "MEDIAN");
    assert.match(html, /FASTER THAN MEDIAN/);
    assert.match(html, /SLOWER THAN MEDIAN/);
    assert.doesNotMatch(html, /YOUR AVERAGE/);
  });

  it("renders frame-adjusted split gaps before goal-derived gaps", () => {
    const data = buildHyroxRaceCardData({
      calculatorMode: "analyse",
      athlete: { name: "Alex Smith", division: "open" },
      race: { finishTimeSeconds: 3600 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "55:00 target" },
        comparisonOptions: [],
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", userSeconds: 3600, frameGapSeconds: 300, percentile: 70 },
        {
          segmentKey: "run_1",
          type: "run",
          label: "Run 1",
          userSeconds: 300,
          goalBenchmarkSeconds: 250,
          frameGapSeconds: -12,
          timeGapToMedianSeconds: 20,
          percentile: 70,
        },
        {
          segmentKey: "wall_balls",
          type: "station",
          label: "Wall Balls",
          userSeconds: 360,
          goalBenchmarkSeconds: 300,
          frameGapSeconds: 45,
          timeGapToMedianSeconds: 80,
          percentile: 40,
        },
      ],
    });
    const html = buildRaceCardHtml(data);

    assert.equal(data.splitRows.find((row) => row.key === "run_1").delta, "-0:12");
    assert.match(html, />\+0:12</);
    assert.doesNotMatch(html, />-0:50</);
  });

  it("marks low-confidence race-card percentiles as directional", () => {
    const data = buildHyroxRaceCardData(confidenceCaveatAnalysis({ confidenceLabel: "insufficient" }));
    const html = buildRaceCardHtml(data);

    assert.equal(data.confidenceQualifier, "directional");
    assert.match(html, /TOP 4% WORLDWIDE \(directional\)/);
  });

  it("marks doubles-benchmarked-as-singles race-card percentiles as directional", () => {
    const data = buildHyroxRaceCardData(confidenceCaveatAnalysis({ doublesBenchmarkedAsSingles: true }));
    const html = buildRaceCardHtml(data);

    assert.equal(data.confidenceQualifier, "directional");
    assert.match(html, /TOP 4% WORLDWIDE \(directional\)/);
  });

  it("does not mark high-confidence race-card percentiles as directional", () => {
    const data = buildHyroxRaceCardData(confidenceCaveatAnalysis({
      confidenceLabel: "strong",
      doublesBenchmarkedAsSingles: false,
    }));
    const html = buildRaceCardHtml(data);

    assert.equal(data.confidenceQualifier, null);
    assert.match(html, /TOP 4% WORLDWIDE/);
    assert.doesNotMatch(html, /\(directional\)/);
  });

  it("does not throw when cards and split rows are absent", () => {
    assert.doesNotThrow(() => buildRaceCardHtml(fixtureData({
      strongestStation: null,
      biggestLimiter: null,
      splitRows: [],
    })));
  });

  it("produces balanced smoke-test markup for a full race card", () => {
    const html = buildRaceCardHtml(fixtureData());

    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /Race Split Profile/);
    assert.equal((html.match(/<div\b/g) ?? []).length, (html.match(/<\/div>/g) ?? []).length);
    assert.equal((html.match(/<svg\b/g) ?? []).length, (html.match(/<\/svg>/g) ?? []).length);
  });
});
