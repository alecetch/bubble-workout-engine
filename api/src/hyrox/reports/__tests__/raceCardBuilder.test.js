import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildRaceCardHtml } from "../raceCardBuilder.js";
import { buildTemplateA } from "../templateSlotMapper.js";
import { SEGMENT_MAP } from "../../config/segmentMap.js";

const RACE_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type === "run" || segment.type === "station");

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
  return RACE_SEGMENTS.map((segment, index) => ({
    key: segment.segmentKey,
    label: segment.displayName,
    type: segment.type,
    raceOrder: segment.raceOrder,
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

function splitProfileSection(html) {
  return sectionBetween(html, "Race Split Profile", '<div class="footer">');
}

function attrValue(html, dataAttr, key, attr) {
  const re = new RegExp(`${dataAttr}="${key}"[^>]*\\s${attr}="([^"]+)"`);
  const match = html.match(re);
  assert.ok(match, `missing ${dataAttr}=${key} ${attr}`);
  return match[1];
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

function penaltyAdjustedGapAnalysis(overrides = {}) {
  return {
    calculatorMode: "analyse",
    athlete: { name: "Kate Wagstaff", division: "open" },
    race: { finishTimeSeconds: 5732 },
    benchmarkContext: {
      primaryBenchmarkGroup: { key: "open:female:sub_95", label: "Open Female Sub 95" },
      comparisonOptions: [{ percentile: 68, topPercent: 32 }],
    },
    headline: {
      biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 88 },
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 28 },
      headlineGainSeconds: 90,
    },
    strengths: [{
      segmentKey: "farmers_carry",
      label: "Farmers Carry",
      type: "station",
      userSeconds: 232,
      percentile: 88,
      frameGapSeconds: 120,
      frameGapNetOfPenaltySeconds: -60,
      timeGapToMedianSeconds: 120,
    }],
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 28 }],
    timePotential: { headlineGainSeconds: 90 },
    penalties: [{ segmentKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
    segments: [
      { segmentKey: "total_time", type: "aggregate", userSeconds: 5732, frameGapSeconds: 900, percentile: 68 },
      { segmentKey: "run_1", type: "run", label: "Run 1", userSeconds: 350, frameGapSeconds: 30, frameGapNetOfPenaltySeconds: 30, percentile: 52 },
      {
        segmentKey: "farmers_carry",
        type: "station",
        label: "Farmers Carry",
        userSeconds: 232,
        frameGapSeconds: 120,
        frameGapNetOfPenaltySeconds: -60,
        timeGapToMedianSeconds: 120,
        percentile: 88,
      },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, frameGapNetOfPenaltySeconds: 90, percentile: 28 },
    ],
    ...overrides,
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
  it("removes the header hero image while keeping the score ring", () => {
    const html = buildRaceCardHtml(fixtureData());

    const header = sectionBetween(html, '<div class="header">', '<div class="hr"></div>');
    assert.doesNotMatch(header, /data:image\/jpeg;base64/);
    assert.doesNotMatch(header, /class="h-right"/);
    assert.doesNotMatch(header, /id="rgl"/);
    assert.match(header, /aria-label="FORMA SCORE 72"/);
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

  it("renders no station icons or sequence numbers in the split profile (removed for clutter)", () => {
    const html = buildRaceCardHtml(fixtureData({
      splitRows: [
        { key: "run_1", label: "Run 1", type: "run", raceOrder: 1, userTime: "5:10", delta: "+0:32", tone: "negative" },
        { key: "ski_erg", label: "SkiErg", type: "station", raceOrder: 2, userTime: "4:50", delta: "-0:09", tone: "positive" },
        { key: "sled_push", label: "Sled Push", type: "station", raceOrder: 4, userTime: "2:12", delta: "+0:51", tone: "negative" },
      ],
    }));
    const splitProfile = splitProfileSection(html);

    assert.doesNotMatch(splitProfile, /data-station-icon=/);
    assert.doesNotMatch(splitProfile, /data-split-sequence=/);
  });

  it("renders all 16 split label groups in race order aligned under their bars", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));
    const splitProfile = splitProfileSection(html);

    assert.equal((splitProfile.match(/data-split-label=/g) ?? []).length, 19);
    assert.match(splitProfile, />5:10</);
    assert.match(splitProfile, />12:25</);

    // A rotated text-anchor="start" run renders with its visual centre offset from its
    // SVG x/rotation-anchor by a roughly constant amount, independent of text length —
    // confirmed by measuring real getBoundingClientRect() output in Chromium (not just
    // the source SVG coordinates, which can't reveal this on their own). The label's x
    // is deliberately offset from the bar's mx to compensate, so assert that exact,
    // known-correct offset rather than x === mx, which renders visibly off-centre.
    const compactLabelFont = 19; // n=16 -> compact branch
    const expectedCompensation = compactLabelFont * 0.34;
    for (const key of ["run_1", "wall_balls"]) {
      const mx = Number(attrValue(splitProfile, "data-split-bar", key, "data-split-mx"));
      const labelX = Number(attrValue(splitProfile, "data-split-label", key, "x"));
      assert.ok(
        Math.abs(labelX - mx - expectedCompensation) < 0.05,
        `expected ${key} label x (${labelX}) to sit ${expectedCompensation} right of bar mx (${mx})`,
      );
    }
  });

  it("renders split delta signs and colors from tone rather than raw delta sign", () => {
    const html = buildRaceCardHtml(fixtureData({
      splitRows: [
        { key: "run_1", label: "Run 1", type: "run", raceOrder: 1, userTime: "5:10", delta: "-0:18", tone: "positive" },
        { key: "ski_erg", label: "SkiErg", type: "station", raceOrder: 2, userTime: "4:50", delta: "+0:32", tone: "negative" },
        { key: "run_2", label: "Run 2", type: "run", raceOrder: 3, userTime: "5:11", delta: "0:00", tone: "neutral" },
      ],
    }));
    const splitProfile = splitProfileSection(html);

    assert.match(splitProfile, /data-split-delta="run_1"[^>]*fill="#3b82f6"[^>]*>\+0:18<\/text>/);
    assert.match(splitProfile, /data-split-delta="ski_erg"[^>]*fill="#ef4444"[^>]*>-0:32<\/text>/);
    assert.match(splitProfile, /data-split-delta="run_2"[^>]*fill="#64748b"[^>]*>0:00<\/text>/);
  });

  it("uses raceOrder to keep missing middle splits from shifting labels", () => {
    const splitRows = allRaceSplits().filter((row) => row.key !== "sled_pull");
    const html = buildRaceCardHtml(fixtureData({ splitRows }));
    const splitProfile = splitProfileSection(html);

    const renderedKeys = [...splitProfile.matchAll(/data-split-bar="([^"]+)"/g)].map((m) => m[1]);
    const expectedKeys = allRaceSplits().map((row) => row.key).filter((key) => key !== "sled_pull");

    assert.doesNotMatch(splitProfile, /data-split-bar="sled_pull"/);
    assert.deepEqual(renderedKeys, expectedKeys, "remaining splits must stay in raceOrder sequence, not shift to fill the gap incorrectly");
  });

  it("renders long split names in full with two rotated sub-lines", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));
    const splitProfile = splitProfileSection(html);

    assert.match(splitProfile, /data-split-label="burpee_broad_jump"[^>]*>BURPEE<\/text>/);
    assert.match(splitProfile, /data-split-label="burpee_broad_jump"[^>]*>BROAD JUMP<\/text>/);
    assert.match(splitProfile, /data-split-label="sandbag_lunges"[^>]*>SANDBAG<\/text>/);
    assert.match(splitProfile, /data-split-label="sandbag_lunges"[^>]*>LUNGES<\/text>/);
    assert.match(splitProfile, /data-split-label="farmers_carry"[^>]*>FARMERS<\/text>/);
    assert.match(splitProfile, /data-split-label="farmers_carry"[^>]*>CARRY<\/text>/);
    assert.doesNotMatch(splitProfile, /BROAD JMP/);
  });

  it("keeps actual split times horizontal", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));
    const splitProfile = splitProfileSection(html);
    const timeMatch = splitProfile.match(/<text data-split-time="burpee_broad_jump"[^>]*>8:17<\/text>/);

    assert.ok(timeMatch);
    assert.doesNotMatch(timeMatch[0], /transform="rotate/);
  });

  it("renders only available columns for partial split data", () => {
    const html = buildRaceCardHtml(fixtureData({
      splitRows: allRaceSplits().slice(0, 4),
    }));
    const splitProfile = splitProfileSection(html);

    assert.equal((splitProfile.match(/data-split-bar=/g) ?? []).length, 4);
    assert.match(splitProfile, /data-split-bar="sled_push"/);
    assert.doesNotMatch(splitProfile, /data-split-bar="run_3"/);
  });

  it("keeps the race-card canvas at the compact original height", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));

    assert.match(html, /html, body \{ width: 1080px; min-height: 1350px;/);
    assert.match(html, /\.root \{ width: 1080px; height: 1350px;/);
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

  it("uses penalty-adjusted race-card split gaps before raw frame gaps", () => {
    const data = buildHyroxRaceCardData(penaltyAdjustedGapAnalysis());
    const farmersRow = data.splitRows.find((row) => row.key === "farmers_carry");

    assert.equal(farmersRow.delta, "-1:00");
    assert.equal(farmersRow.tone, "positive");
    assert.notEqual(farmersRow.delta, "+2:00");
  });

  it("keeps race-card strongest station text consistent with penalty-adjusted split rows", () => {
    const data = buildHyroxRaceCardData(penaltyAdjustedGapAnalysis());
    const farmersRow = data.splitRows.find((row) => row.key === "farmers_carry");

    assert.equal(data.strongestStation.name, "Farmers Carry");
    assert.equal(data.strongestStation.percentile, "Ahead by 1:00");
    assert.equal(farmersRow.delta, "-1:00");
    assert.equal(farmersRow.tone, "positive");
  });

  it("uses penalty-adjusted carousel flow rows and callouts", () => {
    const carousel = buildTemplateA(penaltyAdjustedGapAnalysis(), [], { displayName: "Kate Wagstaff", calculatorMode: "analyse" });
    const slide2 = carousel.slides[1];
    const farmersRow = slide2.stations.find((row) => row.name === "FARMERS CARRY");

    assert.equal(farmersRow.delta, "-1:00");
    assert.equal(farmersRow.tone, "positive");
    assert.equal(slide2.biggest_gain.station, "FARMERS CARRY");
    assert.equal(slide2.biggest_gain.delta, "-1:00");
    assert.equal(slide2.biggest_loss.station, "WALL BALLS");
    assert.equal(slide2.biggest_loss.delta, "+1:30");
    assert.notEqual(slide2.biggest_loss.station, "FARMERS CARRY");
  });

  it("keeps carousel strength slide consistent with penalty-adjusted flow rows", () => {
    const carousel = buildTemplateA(penaltyAdjustedGapAnalysis(), [], { displayName: "Kate Wagstaff", calculatorMode: "analyse" });
    const farmersRow = carousel.slides[1].stations.find((row) => row.name === "FARMERS CARRY");
    const strengthSlide = carousel.slides[2];

    assert.equal(strengthSlide.station, "FARMERS CARRY");
    assert.equal(strengthSlide.percentile, "-1:00 ahead");
    assert.equal(strengthSlide.position_gain, "+1:00");
    assert.equal(farmersRow.delta, "-1:00");
  });

  it("keeps non-penalty race-card and carousel gaps unchanged when net and raw fields match", () => {
    const rawOnly = penaltyAdjustedGapAnalysis({
      penalties: [],
      headline: {
        ...penaltyAdjustedGapAnalysis().headline,
        biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 88 },
      },
      strengths: [{
        segmentKey: "farmers_carry",
        label: "Farmers Carry",
        type: "station",
        userSeconds: 232,
        percentile: 88,
        frameGapSeconds: -60,
        timeGapToMedianSeconds: -60,
      }],
      segments: penaltyAdjustedGapAnalysis().segments.map((segment) => segment.segmentKey === "farmers_carry"
        ? { ...segment, frameGapSeconds: -60, frameGapNetOfPenaltySeconds: undefined, timeGapToMedianSeconds: -60 }
        : segment.segmentKey === "total_time"
          ? { ...segment, frameGapSeconds: 720 }
          : segment),
    });
    const matchingNet = {
      ...rawOnly,
      strengths: rawOnly.strengths.map((segment) => ({ ...segment, frameGapNetOfPenaltySeconds: segment.frameGapSeconds })),
      segments: rawOnly.segments.map((segment) => ({ ...segment, frameGapNetOfPenaltySeconds: segment.frameGapSeconds })),
    };

    assert.equal(
      buildHyroxRaceCardData(rawOnly).splitRows.find((row) => row.key === "farmers_carry").delta,
      buildHyroxRaceCardData(matchingNet).splitRows.find((row) => row.key === "farmers_carry").delta,
    );
    assert.equal(
      buildTemplateA(rawOnly, [], { displayName: "Kate Wagstaff" }).slides[1].stations.find((row) => row.name === "FARMERS CARRY").delta,
      buildTemplateA(matchingNet, [], { displayName: "Kate Wagstaff" }).slides[1].stations.find((row) => row.name === "FARMERS CARRY").delta,
    );
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
