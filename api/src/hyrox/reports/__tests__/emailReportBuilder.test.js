import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmailReport, gapPill } from "../emailReportBuilder.js";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildTemplateA } from "../templateSlotMapper.js";
import { bandScoreLabel, formatOverallStanding, formatPercentileRank } from "../copyFormatter.js";
import { buildCaption } from "../../sharePack/captionBuilder.js";
import { ANALYSIS_FRAMES } from "../../engine/analysisFrameSelector.js";
import { setBenchmarkData } from "../../engine/benchmarkService.js";
import { approximatePercentile } from "../../engine/percentileCalculator.js";

function mockReport(extraSections = []) {
  return {
    sections: [
      {
        sectionKey: "executive_summary",
        title: "Executive Summary",
        content: ["Wall Balls is the biggest estimated opportunity, with 2:44 potential gain."],
      },
      {
        sectionKey: "race_snapshot",
        title: "Race Snapshot",
        content: ["Finish time: 1:33:32.", "Division: open.", "Overall benchmark: 34th percentile against your benchmark group."],
      },
      {
        sectionKey: "biggest_strength",
        title: "Biggest Strength",
        content: "Sled Pull is the strongest benchmarked area at Top 3%.",
      },
      {
        sectionKey: "biggest_limiter",
        title: "Station Breakdown",
        content: [
          "Your weakest stations against your benchmark group:",
          "1. Wall Balls - 34th percentile (+2:44 above median)",
          "2. Sandbag Lunges - 41st percentile (+1:20 above median)",
          "Your strongest station: Sled Pull - Top 3%.",
        ],
      },
      {
        sectionKey: "time_potential",
        title: "Time Potential",
        content: "Estimated opportunity: 2:44 potential gain. This is an estimate, not a guarantee.",
      },
      {
        sectionKey: "recommended_focus_areas",
        title: "Recommended Focus Areas",
        content: [
          "Training focus - 6-12 weeks: focused block:",
          "1. Wall Balls focus: Wall Balls: 34th percentile, estimated gap of 2:44. Likely contributors: 1/ Wall Balls (2:44)",
          "2. Aerobic durability: Engine and strength scores are separated by 18 points.",
        ],
      },
      {
        sectionKey: "cta",
        title: "Next Step",
        content: "Use Forma to build a training plan targeting your bottleneck.",
      },
      ...extraSections,
    ],
    recommendations: [],
  };
}

function mockAnalysis(overrides = {}) {
  return {
    race: { finishTimeSeconds: 5612 },
    athlete: { division: "open" },
    headline: {
      biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 164, percentile: 34 },
    },
    timePotential: { headlineGainSeconds: 164 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", percentile: 34, userSeconds: 5612 },
    ],
    penalties: [],
    roxzoneAnalysis: { available: false },
    ...overrides,
  };
}

function mockContext(overrides = {}) {
  return { displayName: "Alex Smith", division: "open", ...overrides };
}

function withoutDataUris(html) {
  return String(html).replace(/data:image\/[^;"']+;base64,[^"']+/g, "data:image;base64,");
}

function benchmarkLensSection(html) {
  const start = String(html).indexOf('data-section="benchmark-lens"');
  if (start < 0) return "";
  const nextRow = String(html).indexOf("\n  <tr", start + 1);
  return nextRow > start ? String(html).slice(start, nextRow) : String(html).slice(start);
}

function comparisonGroupRow(html) {
  const start = String(html).indexOf("Comparison group");
  if (start < 0) return "";
  const end = String(html).indexOf("</table>", start);
  return end > start ? String(html).slice(start, end) : String(html).slice(start);
}

describe("buildEmailReport visual redesign", () => {
  it("renders a full HTML document", () => {
    const report = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(report.htmlBody.startsWith("<!DOCTYPE html>"), true);
  });

  it("shows doubles confirmation note when useDoublesBenchmarks is true", () => {
    const report = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: true,
          doublesBenchmarkedAsSingles: false,
          primaryBenchmarkGroup: { sampleSize: 8359 },
        },
      }),
      mockContext(),
    );

    assert.ok(report.htmlBody.includes("8,359 teams"), "doubles sample size appears in method note");
    assert.ok(report.htmlBody.includes("dedicated doubles dataset"), "doubles data source note appears in method note");
    assert.ok(report.htmlBody.includes("this comparison group includes 8,359 teams"), "doubles sample size is scoped to the comparison group");
    assert.doesNotMatch(report.htmlBody, /dedicated doubles dataset \(\d[\d,]* teams\)/i);
    assert.ok(!report.htmlBody.includes("DOUBLES BENCHMARK"), "standalone doubles benchmark box is no longer rendered");
    assert.ok(!report.htmlBody.includes("DOUBLES RESULT"));
  });

  it("does not show either doubles block for singles submissions", () => {
    const report = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: false,
          doublesBenchmarkedAsSingles: false,
        },
      }),
      mockContext(),
    );

    assert.ok(!report.htmlBody.includes("DOUBLES BENCHMARK"));
    assert.ok(!report.htmlBody.includes("DOUBLES RESULT"));
  });

  it("still shows legacy caveat when doublesBenchmarkedAsSingles is true", () => {
    const report = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: false,
          doublesBenchmarkedAsSingles: true,
        },
      }),
      mockContext(),
    );

    assert.ok(report.htmlBody.includes("DOUBLES RESULT"));
    assert.ok(!report.htmlBody.includes("DOUBLES BENCHMARK"));
  });

  it("does not emit class attributes", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes('class="'), false);
  });

  it("does not emit external stylesheet links", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("emits the email font import style block", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /fonts\.googleapis\.com/);
  });

  it("uses target-time subject copy in target mode", () => {
    const { subject } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(subject, "Your HYROX target time analysis");
  });

  it("analyse subject names the next band whenever one exists", () => {
    const { subject } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_90",
          nextBand: "sub_80",
          analysisFrame: { frame: "catch_up", comparisonBand: "sub_90" },
        },
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.equal(subject, "You're in the sub-90 band. Here's the route to sub-80.");
  });

  it("renders over-120 doubles bands as a distinct athlete-facing band", () => {
    const { subject, htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: true,
          achievedBand: "over_120",
          nextBand: "sub_120",
          primaryBenchmarkGroup: { label: "Doubles Male", sampleSize: 500 },
        },
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.equal(subject, "You're in the 120:00+ band. Here's the route to 105:00-119:59.");
    assert.match(htmlBody, /120:00\+ - Doubles Male/);
  });

  it("keeps text body plain", () => {
    const { textBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(/<[a-z][\s\S]*>/i.test(textBody), false);
  });

  it("renders the dark brand header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /background-color:#07111f/);
  });

  it("renders the Forma masthead logo and drops the old text tagline", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /alt="Forma — Measure\. Understand\. Improve\."/);
    assert.equal((htmlBody.match(/alt="Forma — Measure\. Understand\. Improve\."/g) ?? []).length, 2, "expected the masthead image in both header and footer");
    assert.equal(htmlBody.includes("PERFORMANCE ENGINEER"), false);
    assert.equal(htmlBody.includes("Performance Analytics for Hybrid Athletes"), false);
    assert.ok(htmlBody.includes("www.getforma.fit"));
  });

  it("replaces the old blue accent", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("#08a7f5"), false);
    assert.ok((htmlBody.match(/#22d3ee/g) ?? []).length >= 2);
  });

  it("hero headline wraps station name with THE...STATION IS phrasing", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.ok(htmlBody.includes("THE WALL BALLS STATION IS YOUR BIGGEST OPPORTUNITY"));
    assert.ok(!htmlBody.includes("WALL BALLS IS YOUR BIGGEST OPPORTUNITY"));
  });

  it("renders the headline gain", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /2:44/);
  });

  it("uses first name in the greeting", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /Hi Alex,/);
  });

  it("uses first name when imported HYROX name is surname-comma-first", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext({ displayName: "Smith, Alice" }));
    assert.match(htmlBody, /Hi Alice,/);
    assert.doesNotMatch(htmlBody, /Hi Smith,/);
  });

  it("uses first name when imported HYROX name is uppercase surname first", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext({ displayName: "SMITH Alice" }));
    assert.match(htmlBody, /Hi Alice,/);
    assert.doesNotMatch(htmlBody, /Hi Smith,/);
  });

  it("uses first names for doubles imported with surname-first names", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis(),
      mockContext({ displayName: "Smith, Alice & JONES Bob" }),
    );
    assert.match(htmlBody, /Hi Alice &amp; Bob,/);
  });

  it("renders finish time in the metric strip", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /1:33:32/);
  });

  it("renders OVERALL STANDING in the analyse metric strip, including penalty-heavy emails", () => {
    const { htmlBody: html1 } = buildEmailReport(mockReport(), mockAnalysis(), mockContext(), null, "analyse");
    assert.match(html1, /Top 66% overall/i);
    assert.match(html1, /OVERALL STANDING/i);

    const { htmlBody: html2 } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        penalties: [{ station: "wall_balls", penaltySeconds: 300 }],
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 99, userSeconds: 5612, timeGapToMedianSeconds: 600 }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.match(html2, /OVERALL STANDING/i);
    assert.equal(html2.includes(">STANDING<"), false);
  });

  it("omits penalty cell when no penalties exist", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("PENALTIES"), false);
  });

  it("renders penalty cell when penalties exist", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] }),
      mockContext(),
    );
    assert.match(htmlBody, /PENALTIES/);
    assert.match(htmlBody, /5:00/);
    assert.match(htmlBody, /#8b5cf6/);
  });

  it("suppresses biggest strength section", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("BIGGEST STRENGTH"), false);
  });

  it("suppresses station breakdown section", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("STATION BREAKDOWN"), false);

    const { htmlBody: penaltyHtml } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        penalties: [{ runKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 34, userSeconds: 5612, timeGapToMedianSeconds: 600 }],
      }),
      mockContext(),
    );
    assert.equal(penaltyHtml.includes("STATION BREAKDOWN"), false);
  });

  it("suppresses time potential section", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("TIME POTENTIAL"), false);
  });

  it("executive summary section is not rendered in email HTML", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.ok(!htmlBody.includes("biggest estimated opportunity"));
  });

  it("renders next training focus card", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /NEXT TRAINING FOCUS/);
    assert.match(htmlBody, /Wall Balls capacity and consistency/);
  });

  it("renders dark training focus card styling", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /background-color:#0c1830/);
  });

  it("does not render verbose likely contributors in email HTML", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.ok(!htmlBody.includes("Likely contributors"));
  });

  it("renders target-time CTA as the analyse email primary button", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext(), null, "analyse");
    assert.match(htmlBody, /Want to work towards a target time\?/);
    assert.doesNotMatch(htmlBody, /BUILD MY HYROX TRAINING PLAN/);
  });

  it("renders carousel link when submissionId is present", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ submissionId: "11111111-1111-4111-8111-111111111111" }),
      mockContext(),
    );
    assert.match(htmlBody, /View your shareable carousel/);
    assert.match(htmlBody, /\/api\/hyrox\/carousel\/11111111-1111-4111-8111-111111111111/);
  });

  it("renders getforma.fit in footer", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /www\.getforma\.fit/);
  });

  it("renders athlete background section when present", () => {
    const { htmlBody } = buildEmailReport(mockReport([
      { sectionKey: "athlete_background", title: "Your Background in Context", content: "Your running background gives useful context." },
    ]), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("YOUR BACKGROUND IN CONTEXT"), true);
    assert.equal(htmlBody.includes("Your running background gives useful context."), true);
  });

  it("omits athlete background section when absent", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("YOUR BACKGROUND IN CONTEXT"), false);
  });

  it("falls back when no limiter exists", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({ headline: {} }), mockContext());
    assert.match(htmlBody, /YOUR HYROX ANALYSIS IS READY/);
  });

  it("handles empty sections", () => {
    const { htmlBody } = buildEmailReport({ sections: [] }, mockAnalysis(), mockContext());
    assert.ok(htmlBody.length > 0);
  });

  it("renders unknown section keys as text cards", () => {
    const { htmlBody } = buildEmailReport(mockReport([
      { sectionKey: "unknown_section", title: "Unknown Section", content: "Fallback body." },
    ]), mockAnalysis(), mockContext());
    assert.match(htmlBody, /UNKNOWN SECTION/);
    assert.match(htmlBody, /Fallback body/);
  });

  it("collapses contributor-heavy recommendations into training focus", () => {
    const report = {
      sections: [
        {
          sectionKey: "recommended_focus_areas",
          title: "Recommended Focus Areas",
          content: ["Training focus:", "1. Station focus: Some rationale."],
          richRecommendations: [
            {
              priority: 1,
              title: "Station focus",
              rationale: "Some rationale.",
              contributors: [
                { label: "Penalties", gainSeconds: 300, copy: "eliminate these and gain 5:00" },
                { label: "Sandbag Lunges", gainSeconds: 76, copy: "athletes finishing in 1:20:00 complete these ~1:16 faster" },
              ],
              runGapNote: null,
            },
          ],
        },
        { sectionKey: "cta", title: "Next Step", content: "Use Forma to build a training plan." },
      ],
    };
    const { htmlBody } = buildEmailReport(report, mockAnalysis(), mockContext());
    const searchableHtml = withoutDataUris(htmlBody);
    assert.match(htmlBody, /NEXT TRAINING FOCUS/);
    assert.ok(!searchableHtml.includes("a/"));
    assert.ok(!searchableHtml.includes("b/"));
  });

  it("does not render runGapNote in compact training focus card", () => {
    const report = {
      sections: [
        {
          sectionKey: "recommended_focus_areas",
          title: "Recommended Focus Areas",
          content: ["1. Station focus: Some rationale."],
          richRecommendations: [
            {
              priority: 1,
              title: "Station focus",
              rationale: "Some rationale.",
              contributors: [
                { label: "Wall Balls", gainSeconds: 80, copy: "athletes finishing in 1:20:00 complete these faster" },
                { label: "Sandbag Lunges", gainSeconds: 70, copy: "athletes finishing in 1:20:00 complete these faster" },
              ],
              runGapNote: "Your running also contributed an estimated 4:54 to the gap - see pacing below.",
            },
          ],
        },
        { sectionKey: "cta", title: "Next Step", content: "Use Forma to build a training plan." },
      ],
    };
    const { htmlBody } = buildEmailReport(report, mockAnalysis(), mockContext());
    assert.ok(!htmlBody.includes("4:54"));
    assert.ok(!htmlBody.includes("font-style:italic"));
  });

  it("renders the Fitness training-focus chip as a dark email badge", () => {
    const report = {
      sections: [
        {
          sectionKey: "recommended_focus_areas",
          title: "Recommended Focus Areas",
          content: ["1. Station focus: Some rationale."],
          richRecommendations: [
            {
              priority: 1,
              title: "Station focus",
              category: "Fitness",
              rationale: "Some rationale.",
              contributors: [{ label: "Wall Balls", gainSeconds: 80, copy: "complete these faster" }],
            },
          ],
        },
      ],
    };
    const { htmlBody } = buildEmailReport(report, mockAnalysis(), mockContext());
    const searchableHtml = withoutDataUris(htmlBody);
    assert.match(searchableHtml, /FITNESS/);
    assert.match(searchableHtml, /background-color:#0a2030/);
    assert.match(searchableHtml, /border:1px solid rgba\(34,211,238,0\.32\)/);
    assert.doesNotMatch(searchableHtml, /background-color:#e0f2fe/);
  });

  it("does not render contributors table for single-item contributors array", () => {
    const report = {
      sections: [
        {
          sectionKey: "recommended_focus_areas",
          title: "Recommended Focus Areas",
          content: ["1. Station focus: Some rationale."],
          richRecommendations: [
            {
              priority: 1,
              title: "Station focus",
              rationale: "Single limiter rationale.",
              contributors: [{ label: "Wall Balls", gainSeconds: 80, copy: "complete these faster" }],
              runGapNote: null,
            },
          ],
        },
        { sectionKey: "cta", title: "Next Step", content: "Use Forma to build a training plan." },
      ],
    };
    const { htmlBody } = buildEmailReport(report, mockAnalysis(), mockContext());
    assert.ok(!withoutDataUris(htmlBody).includes("a/"), "No lettered list for single contributor");
  });

  it("renders roxzone narrative table with N/A Wall Balls and rounding caveat", () => {
    const roxzoneSection = {
      sectionKey: "roxzone_execution",
      title: "RoxZone Execution",
      content: [
        "Your Race Replay rows add up to 4:31 of measurable RoxZone time, versus 4:33 officially.",
        "The biggest RoxZone story is around Sandbag Lunges.",
        "Prioritise compromised Sandbag Lunges practice.",
        "Race Replay checkpoint rows are rounded before summing, so the station-by-station total may differ by a few seconds from the official RoxZone total.",
        {
          __type: "roxzone_narrative",
          replayTotalSeconds: 271,
          officialTotalSeconds: 273,
          roundingDifferenceSeconds: 2,
          displayRows: [
            { label: "Ski Erg", entrySeconds: 5, exitSeconds: 31, roxzoneSeconds: 36, measurable: true },
            { label: "Wall Balls", entrySeconds: null, exitSeconds: null, roxzoneSeconds: null, measurable: false },
          ],
        },
      ],
    };
    const { htmlBody, textBody } = buildEmailReport(mockReport([roxzoneSection]), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("ROXZONE EXECUTION"), false);
    assert.equal(htmlBody.includes("Replay RoxZone Total"), false);
    assert.match(textBody, /rounded before summing/i);
  });

  it("running_fatigue section is suppressed in email HTML", () => {
    const report = mockReport([{
      sectionKey: "running_fatigue",
      title: "Running and Fatigue Profile",
      content: ["Run fade was 8.4%, unique marker text."],
    }]);
    const { htmlBody } = buildEmailReport(report, mockAnalysis(), {}, null);
    assert.ok(!htmlBody.includes("Run fade was 8.4%, unique marker text."));
  });

  it("muscle group section renders signal table without inline SVG", () => {
    const muscleSection = {
      sectionKey: "muscle_group_profile",
      title: "Muscle Group Profile",
      content: [
        "Your quad-dominant stations are your primary training signal.",
        "Weakest stations: Wall Balls (8th percentile), Burpee Broad Jump (10th percentile)",
        "Relative strengths: Sled Pull (Top 5%)",
        { __type: "muscle_diagram_pair", frontSvg: "<svg></svg>", backSvg: "<svg></svg>" },
      ],
    };
    const { htmlBody } = buildEmailReport({ sections: [muscleSection] }, mockAnalysis(), {}, null);
    assert.ok(!htmlBody.includes("<svg"));
    assert.ok(htmlBody.includes("MUSCLE GROUP SIGNAL"));
    assert.ok(htmlBody.includes("Area"));
    assert.ok(htmlBody.includes("Wall Balls"));
    assert.ok(htmlBody.includes("Opportunity"));
    assert.ok(htmlBody.includes("Sled Pull"));
    assert.ok(htmlBody.includes("Strength"));
  });

  it("muscle group strength area excludes weakest-stations prefix", () => {
    const muscleSection = {
      sectionKey: "muscle_group_profile",
      title: "Muscle Group Profile",
      content: [
        "Quad-dominant and Push / shoulder are the common thread across your weakest stations; your Core / stability is a clear strength.",
        "Weakest stations: Wall Balls (8th percentile), Burpee Broad Jump (10th percentile), Row (13th percentile)",
        "Strongest stations: Sled Pull (59th percentile), Sled Push (53rd percentile), Farmers Carry (51st percentile)",
      ],
    };
    const { htmlBody } = buildEmailReport({ sections: [muscleSection] }, mockAnalysis(), {}, null);
    assert.ok(htmlBody.includes("Core / stability"));
    assert.ok(!htmlBody.includes("weakest stations; your Core / stability"));
  });

  it("footer includes methodology note", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), {}, null);
    assert.ok(htmlBody.includes("positive gap means slower than target"));
  });

});

describe("muscle group signal labelling", () => {
  function muscleSection(content = [
    "Quad-dominant and Core / stability are the common thread across your weakest stations",
    "Weakest stations: Wall Balls (+2:00), Sandbag Lunges (+1:10)",
    "Strongest station: Sled Pull (-0:20)",
  ]) {
    return {
      sectionKey: "muscle_group_profile",
      title: "Muscle Group Profile",
      content,
    };
  }

  function muscleAnalysis(overrides = {}) {
    return mockAnalysis({
      benchmarkContext: { achievedBand: "sub_80", primaryBenchmarkGroup: { label: "Open Men 30-39" } },
      race: { finishTimeSeconds: 4800 },
      muscleGroupProfile: {
        available: true,
        muscleGroupSignals: [
          { groupId: "quad_dominant", label: "Quad-dominant", weakCount: 1, strongCount: 0, signal: "limiter" },
          { groupId: "core_stability", label: "Core / stability", weakCount: 1, strongCount: 0, signal: "limiter" },
        ],
      },
      ...overrides,
    });
  }

  function renderMuscleEmail(analysisOverrides = {}, content, mode = "analyse") {
    const { htmlBody } = buildEmailReport(
      { sections: [muscleSection(content)] },
      muscleAnalysis(analysisOverrides),
      mockContext(),
      null,
      mode,
    );
    return htmlBody;
  }

  it("elite athlete by sub_60 band shows Refinement Area", () => {
    const htmlBody = renderMuscleEmail({
      benchmarkContext: { achievedBand: "sub_60", primaryBenchmarkGroup: { label: "sub-60" } },
      race: { finishTimeSeconds: 3400 },
      muscleGroupProfile: {
        available: true,
        muscleGroupSignals: [
          { groupId: "quad_dominant", label: "Quad-dominant", weakCount: 2, strongCount: 0, signal: "limiter" },
          { groupId: "core_stability", label: "Core / stability", weakCount: 2, strongCount: 0, signal: "limiter" },
        ],
      },
    });
    assert.match(htmlBody, /Refinement Area/);
    assert.match(htmlBody, /#22d3ee/);
    assert.doesNotMatch(htmlBody, /Weakness/);
  });

  it("sub-60 finish time without achievedBand shows Refinement Area", () => {
    const htmlBody = renderMuscleEmail({
      benchmarkContext: {},
      race: { finishTimeSeconds: 3500 },
    });
    assert.match(htmlBody, /Refinement Area/);
  });

  it("non-elite weakCount below 3 shows Opportunity", () => {
    const htmlBody = renderMuscleEmail();
    assert.match(htmlBody, /Opportunity/);
    assert.match(htmlBody, /#fbbf24/);
    assert.doesNotMatch(htmlBody, /#fcd9a0/);
    assert.doesNotMatch(htmlBody, /Refinement Area/);
    assert.doesNotMatch(htmlBody, /Weakness/);
  });

  it("non-elite weakCount of 3 or more shows Weakness", () => {
    const htmlBody = renderMuscleEmail({
      muscleGroupProfile: {
        available: true,
        muscleGroupSignals: [
          { groupId: "quad_dominant", label: "Quad-dominant", weakCount: 3, strongCount: 0, signal: "limiter" },
          { groupId: "core_stability", label: "Core / stability", weakCount: 3, strongCount: 0, signal: "limiter" },
        ],
      },
    });
    assert.match(htmlBody, /Weakness/);
    assert.match(htmlBody, /#f87171/);
  });

  it("strength signal is unchanged for all athlete levels", () => {
    const htmlBody = renderMuscleEmail(
      {
        benchmarkContext: { achievedBand: "sub_80" },
        muscleGroupProfile: {
          available: true,
          muscleGroupSignals: [
            { groupId: "quad_dominant", label: "Quad-dominant", weakCount: 1, strongCount: 0, signal: "limiter" },
            { groupId: "upper_back_pull", label: "Upper back / pull", weakCount: 0, strongCount: 2, signal: "asset" },
          ],
        },
      },
      ["your upper back / pull is a clear strength"],
    );
    assert.match(htmlBody, /Strength/);
    assert.match(htmlBody, /#4ade80/);
  });

  it("target mode goal band does not inflate elite classification", () => {
    const htmlBody = renderMuscleEmail({
      benchmarkContext: {
        achievedBand: "sub_90",
        goalBenchmarkGroup: { label: "sub-60" },
      },
      race: { finishTimeSeconds: 5400 },
    }, undefined, "target");
    assert.doesNotMatch(htmlBody, /Refinement Area/);
    assert.match(htmlBody, /Opportunity/);
  });

  it("muscle group signal badges do not use pale legacy backgrounds", () => {
    const htmlBody = renderMuscleEmail();
    assert.doesNotMatch(htmlBody, /#fff4f4/);
    assert.doesNotMatch(htmlBody, /#f0fdf4/);
    assert.doesNotMatch(htmlBody, /#fcd9a0/);
  });
});

describe("bandScoreLabel", () => {
  it("returns Strength for gaps at least 5% ahead of comparison", () => {
    assert.equal(bandScoreLabel(-50, 1000), "Strength");
  });

  it("returns Good for gaps 2-5% ahead of comparison", () => {
    assert.equal(bandScoreLabel(-20, 1000), "Good");
  });

  it("returns On benchmark for gaps within 5% slower of comparison", () => {
    assert.equal(bandScoreLabel(50, 1000), "On benchmark");
  });

  it("returns Opportunity for gaps 5-15% slower than comparison", () => {
    assert.equal(bandScoreLabel(150, 1000), "Opportunity");
  });

  it("returns Priority beyond the opportunity band", () => {
    assert.equal(bandScoreLabel(151, 1000), "Priority");
  });
});

describe("formatOverallStanding", () => {
  it("formats high percentiles as top-percent overall labels", () => {
    assert.equal(formatOverallStanding(99), "Top 1% overall");
    assert.equal(formatOverallStanding(95), "Top 5% overall");
    assert.equal(formatOverallStanding(90), "Top 10% overall");
    assert.equal(formatOverallStanding(75), "Top 25% overall");
    assert.equal(formatOverallStanding(74), "Top 26% overall");
    assert.equal(formatOverallStanding(34), "Top 66% overall");
  });
});

describe("regional context line in email hero", () => {
  it("includes the regional context sentence when available and gap is at least 5pp", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          regionalBenchmark: {
            available: true,
            region: "europe",
            regionLabel: "Europe",
            fieldPercentile: 45,
          },
        },
        segments: [{ segmentKey: "total_time", fieldPercentile: 55, percentile: 55 }],
      }),
      mockContext(),
    );

    assert.match(htmlBody, /Europe events attract a stronger-than-average field/);
    assert.match(htmlBody, /top 55%/);
  });

  it("does not include the sentence when gap is below 5pp", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          regionalBenchmark: { available: true, region: "europe", regionLabel: "Europe", fieldPercentile: 52 },
        },
        segments: [{ segmentKey: "total_time", fieldPercentile: 55, percentile: 55 }],
      }),
      mockContext(),
    );

    assert.doesNotMatch(htmlBody, /stronger-than-average field/);
    assert.doesNotMatch(htmlBody, /Globally, where fields/);
  });

  it("does not include the sentence when regional benchmark is unavailable", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: { regionalBenchmark: { available: false } },
        segments: [{ segmentKey: "total_time", fieldPercentile: 55, percentile: 55 }],
      }),
      mockContext(),
    );

    assert.doesNotMatch(htmlBody, /stronger-than-average field/);
    assert.doesNotMatch(htmlBody, /Globally, where fields/);
  });

  it("renders global-context sentence for weaker regional field", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          regionalBenchmark: {
            available: true,
            region: "asia",
            regionLabel: "Asia",
            fieldPercentile: 70,
          },
        },
        segments: [{ segmentKey: "total_time", fieldPercentile: 55, percentile: 55 }],
      }),
      mockContext(),
    );

    assert.match(htmlBody, /Globally, where fields include more established athletes/);
    assert.match(htmlBody, /top 45%/);
  });
});

describe("analyse mode subject", () => {
  it("does not route the slowest band back to itself", () => {
    const { subject } = buildEmailReport(
      { sections: [] },
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_105",
          analysisFrame: { comparisonBand: "sub_105" },
          primaryBenchmarkGroup: { label: "Open Female" },
        },
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.equal(subject, "You're in the 100:00-104:59 band. Here's where the next time comes from.");
    assert.ok(!subject.includes("route to sub-105"));
  });

  for (const band of ["sub_70", "sub_90"]) {
    it(`does not describe ${band} as its own next test`, () => {
      const bandLabel = band.replace("sub_", "sub-");
      const { subject } = buildEmailReport(
        { sections: [] },
        mockAnalysis({
          benchmarkContext: {
            achievedBand: band,
            nextBand: band,
            analysisFrame: { frame: "next_band", comparisonBand: band, stretchBand: null, gapToBandMedianSeconds: -80 },
            primaryBenchmarkGroup: { label: "Doubles" },
          },
        }),
        mockContext(),
        null,
        "analyse",
      );

      assert.equal(subject, `You're in the ${bandLabel} band. Here's where the next time comes from.`);
      assert.ok(!subject.includes(`${bandLabel} group. ${bandLabel} is the next test.`));
    });
  }
});

describe("target mode email", () => {
  it("target mode metric strip shows TARGET TIME not BENCHMARK", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 45, userSeconds: 3900, goalBenchmarkSeconds: 3600 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("TARGET TIME"), "should contain TARGET TIME label");
    assert.ok(!htmlBody.includes(">BENCHMARK<"), "should not contain BENCHMARK label");
  });

  it("target mode metric strip uses selected target time instead of benchmark median", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "55:00 target" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      segments: [
        {
          segmentKey: "total_time",
          type: "aggregate",
          percentile: 45,
          userSeconds: 3900,
          exactTargetSeconds: 3300,
          goalBenchmarkSeconds: 3543,
        },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("55:00"), "should show the selected target time");
    assert.ok(!htmlBody.includes("59:03"), "should not show the benchmark median as the target time");
  });

  it("target mode falls back to submitted target time and never renders 0:00", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: null,
        primaryBenchmarkGroup: { label: "Doubles Male" },
      },
      segments: [
        {
          segmentKey: "total_time",
          type: "aggregate",
          percentile: 45,
          userSeconds: 3900,
          exactTargetSeconds: 0,
          goalBenchmarkSeconds: 3600,
        },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { subject, htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      analysis,
      mockContext({ targetFinishTimeSeconds: 3300, targetTimeSeconds: 3300 }),
      null,
      "target",
    );
    assert.match(subject, /55:00/);
    assert.ok(htmlBody.includes("TARGET TIME"), "should contain TARGET TIME label");
    assert.ok(htmlBody.includes("55:00"), "should show the submitted target time");
    assert.ok(!htmlBody.includes(">0:00<"), "should not render 0:00 as a target");
  });

  it("target mode opportunity rows use target labels not benchmark band labels", () => {
    const benchmarkContext = {
      goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
      primaryBenchmarkGroup: { label: "Open Male" },
      achievedBand: "sub_65",
    };
    const segments = [
      { segmentKey: "total_time", type: "aggregate", label: "Total", percentile: 45, userSeconds: 3900, goalBenchmarkSeconds: 3600 },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 30, userSeconds: 480, goalBenchmarkSeconds: 360, confidence: "high" },
      { segmentKey: "work_time", type: "aggregate", label: "Stations", percentile: 30, userSeconds: 2800, goalBenchmarkSeconds: 2500 },
      { segmentKey: "run_time", type: "aggregate", label: "Running", percentile: 60, userSeconds: 900, goalBenchmarkSeconds: 900 },
      { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", percentile: 60, userSeconds: 200, goalBenchmarkSeconds: 200 },
    ];
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments, benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, mockAnalysis({
      benchmarkContext,
      segments,
    }), mockContext(), null, "target");
    assert.ok(!htmlBody.includes("vs your benchmark band"), "target mode should not say 'vs your benchmark band'");
    assert.ok(
      htmlBody.includes("target opportunity") || htmlBody.includes("Target opportunity") || htmlBody.includes("target profile"),
      "should contain target-specific labels",
    );
  });

  it("target mode method and RoxZone copy use target profile language", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total", percentile: 45, userSeconds: 3900, goalBenchmarkSeconds: 3600 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", percentile: 30, userSeconds: 2800, goalBenchmarkSeconds: 2500 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", percentile: 60, userSeconds: 900, goalBenchmarkSeconds: 900 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", percentile: 20, userSeconds: 260, goalBenchmarkSeconds: 200 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("selected target profile"), "method note should reference target profile");
    assert.ok(htmlBody.includes("above target profile"), "RoxZone note should reference target profile");
    assert.ok(!htmlBody.includes("vs your benchmark band"), "target mode should not say 'vs your benchmark band'");
    assert.ok(!htmlBody.includes("benchmark median"), "target mode should not mention benchmark median");
    assert.ok(!htmlBody.includes("above benchmark"), "target mode should not say 'above benchmark'");
  });

  it("target mode split table header says Target status not Band score", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 45, userSeconds: 3900, goalBenchmarkSeconds: 3543, exactTargetSeconds: 3600 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 30, fieldPercentile: 35, userSeconds: 480, goalBenchmarkSeconds: 360, exactTargetSeconds: 340 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(!htmlBody.includes("Band score"), "target mode must not say Band score");
    assert.ok(htmlBody.includes("Target status"), "target mode must say Target status");
  });

  it("target mode uses plural grammar for Wall Balls", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120 } },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 45, userSeconds: 3900, goalBenchmarkSeconds: 3543, exactTargetSeconds: 3600 },
        { segmentKey: "work_time", type: "aggregate", percentile: 35, userSeconds: 2600, goalBenchmarkSeconds: 2200, exactTargetSeconds: 2100 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 30, fieldPercentile: 35, userSeconds: 480, goalBenchmarkSeconds: 360, exactTargetSeconds: 340 },
        { segmentKey: "run_time", type: "aggregate", percentile: 50, userSeconds: 1300, goalBenchmarkSeconds: 1200, exactTargetSeconds: 1200 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(!htmlBody.includes("Wall Balls is"), `should not say "Wall Balls is", got: ${htmlBody.includes("Wall Balls") ? "Wall Balls found" : "Wall Balls not found"}`);
    assert.ok(htmlBody.includes("Wall Balls are"), "should use plural Wall Balls grammar");
  });

  it("elite athlete (sub_60 band) in target mode gets elite stretch feasibility", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 75, userSeconds: 3548, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", percentile: 65, userSeconds: 2200, goalBenchmarkSeconds: 2000, exactTargetSeconds: 1980 },
        { segmentKey: "run_time", type: "aggregate", percentile: 70, userSeconds: 1300, goalBenchmarkSeconds: 1200, exactTargetSeconds: 1200 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("elite stretch"), `elite athlete should get 'elite stretch', html snippet: ${htmlBody.substring(0, 500)}`);
    assert.ok(!htmlBody.includes("ambitious but plausible"), "elite athlete should not get 'ambitious but plausible'");
  });

  it("sub-60 athlete targeting 55:00 gets elite stretch feasibility", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 75, fieldPercentile: 72, userSeconds: 3548, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", percentile: 65, userSeconds: 2200, goalBenchmarkSeconds: 2000, exactTargetSeconds: 1980 },
        { segmentKey: "run_time", type: "aggregate", percentile: 70, userSeconds: 1250, goalBenchmarkSeconds: 1200, exactTargetSeconds: 1200 },
        { segmentKey: "roxzone_time", type: "aggregate", percentile: 80, userSeconds: 98, goalBenchmarkSeconds: 100, exactTargetSeconds: 100 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("elite stretch"), "sub-60 targeting 55:00 must say elite stretch");
    assert.ok(!htmlBody.includes("ambitious but plausible"), "must not say ambitious but plausible for elite target");
  });

  it("target roadmap qualifies protected RoxZone when Race Replay shows late drift", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      headline: { biggestLimiter: { label: "Sandbag Lunges", segmentKey: "sandbag_lunges", timeGapSeconds: 100 } },
      roxzoneAnalysis: {
        available: true,
        entryTrend: "rising",
        roxzoneNarrative: {
          available: true,
          scenarioTags: ["controlled_roxzone", "late_race_drift"],
        },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", percentile: 75, userSeconds: 3548, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", percentile: 65, userSeconds: 2200, goalBenchmarkSeconds: 2000, exactTargetSeconds: 1980 },
        { segmentKey: "sandbag_lunges", type: "station", label: "Sandbag Lunges", percentile: 45, userSeconds: 210, goalBenchmarkSeconds: 120, exactTargetSeconds: 110 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", percentile: 70, userSeconds: 1250, goalBenchmarkSeconds: 1200, exactTargetSeconds: 1200 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", percentile: 80, userSeconds: 70, goalBenchmarkSeconds: 100, exactTargetSeconds: 100 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("protect overall RoxZone - already ahead of target, with late-race flow polish"));
    assert.ok(htmlBody.includes("overall RoxZone execution - ahead of the target profile, but protect late-race flow"));
  });

  it("target mode derives sub-60 status from finish time when achievedBand is absent", () => {
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 3548 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 75, fieldPercentile: 72, userSeconds: 3548, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", percentile: 65, userSeconds: 2200, goalBenchmarkSeconds: 2000, exactTargetSeconds: 1980 },
        { segmentKey: "run_time", type: "aggregate", percentile: 70, userSeconds: 1250, goalBenchmarkSeconds: 1200, exactTargetSeconds: 1200 },
        { segmentKey: "roxzone_time", type: "aggregate", percentile: 80, userSeconds: 98, goalBenchmarkSeconds: 100, exactTargetSeconds: 100 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("elite stretch"), "target mode should derive sub-60 from finish time");
    assert.ok(!htmlBody.includes("ambitious but plausible"), "must not say ambitious but plausible when finish time is sub-60 and target is 55:00");
  });

  it("sub-60 athlete targeting 1:00:00 does not get elite stretch", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_60",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 75, fieldPercentile: 72, userSeconds: 3700, goalBenchmarkSeconds: 3600, exactTargetSeconds: 3600 },
        { segmentKey: "work_time", type: "aggregate", percentile: 65, userSeconds: 2300, goalBenchmarkSeconds: 2200, exactTargetSeconds: 2200 },
        { segmentKey: "run_time", type: "aggregate", percentile: 70, userSeconds: 1300, goalBenchmarkSeconds: 1250, exactTargetSeconds: 1250 },
        { segmentKey: "roxzone_time", type: "aggregate", percentile: 80, userSeconds: 100, goalBenchmarkSeconds: 100, exactTargetSeconds: 100 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(!htmlBody.includes("elite stretch"), "sub-60 targeting 1:00:00 should not get elite stretch");
  });

  it("overall standing in email uses Top X% not raw percentile", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 40, fieldPercentile: 40, userSeconds: 4800, benchmarkMedianSeconds: 3900 },
      ],
    });
    const { htmlBody } = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");
    assert.ok(!htmlBody.includes("percentile overall"), "email must not contain raw percentile ordinal");
    assert.ok(htmlBody.includes("Top ") && htmlBody.includes("% overall"), "email must contain Top X% overall");
  });

  it("OVERALL STANDING always uses the plain label and the true (non-age-scoped) percentile", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_80",
        primaryBenchmarkGroup: { label: "Open Male" },
        ageBenchmark: { available: true, ageGroup: "45-49", fieldPercentile: 94 },
        comparisonOptions: [
          { id: "global", label: "Global", percentile: 86, topPercent: 14 },
          { id: "age_group", label: "Age group 45-49", percentile: 94, topPercent: 6 },
        ],
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 70, fieldPercentile: 94, overallFieldPercentile: 75, userSeconds: 4500, benchmarkMedianSeconds: 4800 },
      ],
    });

    const { htmlBody } = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");

    assert.match(htmlBody, /OVERALL STANDING/i);
    assert.doesNotMatch(htmlBody, /OVERALL STANDING \(AGE GROUP\)/i);
    assert.match(htmlBody, /Top 25% overall/i, "should use the true overall percentile (75), not the age-scoped one (94)");
    assert.doesNotMatch(htmlBody, /Top 6% overall/i);
  });

  it("adds an age-group callout in the hero when age-group standing differs substantially from overall", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_80", primaryBenchmarkGroup: { label: "Open Male" } },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 70, fieldPercentile: 94, overallFieldPercentile: 75, userSeconds: 4500, benchmarkMedianSeconds: 4800 },
      ],
    });

    const { htmlBody } = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");

    assert.match(htmlBody, /Within your age group specifically, this ranks you in the top 6%/i);
  });

  it("omits the age-group callout when age-group and overall standing are close", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_80", primaryBenchmarkGroup: { label: "Open Male" } },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 70, fieldPercentile: 78, overallFieldPercentile: 75, userSeconds: 4500, benchmarkMedianSeconds: 4800 },
      ],
    });

    const { htmlBody } = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");

    assert.doesNotMatch(htmlBody, /Within your age group specifically/i);
  });

  it("target mode route section does not put run splits in station-efficiency bullet", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 40, userSeconds: 3600, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", percentile: 35, userSeconds: 2200, goalBenchmarkSeconds: 1980, exactTargetSeconds: 1980 },
        { segmentKey: "run_time", type: "aggregate", percentile: 50, userSeconds: 1300, goalBenchmarkSeconds: 1140, exactTargetSeconds: 1140 },
        { segmentKey: "roxzone_time", type: "aggregate", percentile: 55, userSeconds: 100, goalBenchmarkSeconds: 90, exactTargetSeconds: 90 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 30, fieldPercentile: 32, userSeconds: 480, goalBenchmarkSeconds: 360, exactTargetSeconds: 350 },
        { segmentKey: "run_6", type: "run", label: "Run 6", percentile: 40, fieldPercentile: 42, userSeconds: 280, goalBenchmarkSeconds: 200, exactTargetSeconds: 195 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(!htmlBody.includes("station efficiency, led by Wall Balls and Run"), "station efficiency bullet must not name a run split");
    assert.ok(htmlBody.includes("station efficiency, led by Wall Balls"), "Wall Balls should appear in station-efficiency bullet");
    assert.ok(htmlBody.includes("running pace, especially Run 6"), "Run 6 should appear in running-pace bullet");
    assert.ok(!htmlBody.includes("from station efficiency, led by Wall Balls and Run 6"));
  });

  it("target route running figure matches the running gap stated in MAIN INSIGHT", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60", key: "sub_60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_85",
      },
      headline: {
        biggestLimiter: { label: "Run 4", segmentKey: "run_4", type: "run", timeGapSeconds: 2213, percentile: 20 },
      },
      timePotential: { headlineGainSeconds: 2213 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total", frameGapSeconds: 1280, userSeconds: 4880, goalBenchmarkSeconds: 3600, exactTargetSeconds: 3600 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", frameGapSeconds: 1000, userSeconds: 2800, goalBenchmarkSeconds: 1800, exactTargetSeconds: 1800 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", frameGapSeconds: 2213, userSeconds: 4013, goalBenchmarkSeconds: 1800, exactTargetSeconds: 1800 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", frameGapSeconds: 120, userSeconds: 220, goalBenchmarkSeconds: 100, exactTargetSeconds: 100 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 1000, userSeconds: 1360, goalBenchmarkSeconds: 360, exactTargetSeconds: 360, percentile: 30 },
        { segmentKey: "run_4", type: "run", label: "Run 4", frameGapSeconds: 2213, userSeconds: 2513, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, percentile: 20 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    const insightHtml = htmlBody.slice(htmlBody.indexOf("MAIN INSIGHT"), htmlBody.indexOf("SEGMENT PROFILE"));
    const routeHtml = htmlBody.slice(htmlBody.indexOf("YOUR ROUTE TO"), htmlBody.indexOf("TARGET PRIORITIES"));

    assert.match(insightHtml, /\+36:53/);
    assert.match(routeHtml, /around 36:53 from running pace/i);
    assert.doesNotMatch(routeHtml, /around 2:40 from running pace/i);
  });

  it("target mode RoxZone gap of +15 s is On target not Opportunity", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "sub-55", key: "k" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 40, userSeconds: 3600, goalBenchmarkSeconds: 3300, exactTargetSeconds: 3300 },
        { segmentKey: "work_time", type: "aggregate", percentile: 35, userSeconds: 2200, goalBenchmarkSeconds: 1980, exactTargetSeconds: 1980 },
        { segmentKey: "run_time", type: "aggregate", percentile: 50, userSeconds: 1300, goalBenchmarkSeconds: 1140, exactTargetSeconds: 1140 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", percentile: 55, userSeconds: 105, goalBenchmarkSeconds: 90, exactTargetSeconds: 90 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    const roxZoneCardStart = htmlBody.indexOf(">RoxZone<");
    const roxZoneCard = htmlBody.slice(roxZoneCardStart, roxZoneCardStart + 900);
    assert.ok(roxZoneCard.includes("On target"), "small RoxZone gap should produce On target label");
    assert.ok(!roxZoneCard.includes("Opportunity"), "small RoxZone gap should not produce Opportunity label");
  });

  it("analyse mode still uses benchmark band labels and Overall Standing", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
        analysisFrame: { frame: "competitive" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 65, fieldPercentile: 65, userSeconds: 3900 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 30, userSeconds: 480 },
      ],
    });
    const { htmlBody } = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");
    assert.ok(htmlBody.includes("OVERALL STANDING"), "analyse mode should still show OVERALL STANDING");
    assert.ok(!htmlBody.includes("TARGET TIME"), "analyse mode should not show TARGET TIME label");
    assert.ok(htmlBody.includes("benchmark median") || htmlBody.includes("benchmark band"), "analyse mode should retain benchmark language");
  });

  it("analyse mode uses Split status header", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 65, fieldPercentile: 65, userSeconds: 3900 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 40, fieldPercentile: 45, userSeconds: 480 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.ok(htmlBody.includes("Split status"), "analyse mode must say Split status");
    assert.ok(!htmlBody.includes("Band score"), "analyse mode must not say Band score");
    assert.ok(!htmlBody.includes("Target status"), "analyse mode must not say Target status");
  });

  it("target mode does not report percentile standing", () => {
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 5612 },
      benchmarkContext: {
        goalBenchmarkGroup: { label: "Sub 90 target", targetFinishSeconds: 5400 },
      },
      segments: [
        {
          segmentKey: "total_time",
          type: "aggregate",
          percentile: 40,
          fieldPercentile: 40,
          userSeconds: 5612,
          exactTargetSeconds: 5400,
        },
        {
          segmentKey: "wall_balls",
          type: "station",
          label: "Wall Balls",
          percentile: 40,
          fieldPercentile: 40,
          userSeconds: 500,
          goalBenchmarkSeconds: 420,
          confidence: "high",
        },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.ok(htmlBody.includes("TARGET GAP"), "target mode should show target gap instead of standing");
    assert.ok(htmlBody.includes("Target basis"), "target mode should label split comparison as target-based");
    assert.ok(htmlBody.includes("Target status"), "target mode should retain target status");
    assert.doesNotMatch(htmlBody, /40th percentile/i);
    assert.doesNotMatch(htmlBody, /OVERALL STANDING/i);
  });

  it("analyse mode segment card labels use existing benchmark thresholds", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 65, fieldPercentile: 65, userSeconds: 3900 },
        { segmentKey: "work_time", type: "aggregate", percentile: 35, userSeconds: 2200, benchmarkMedianSeconds: 2000 },
        { segmentKey: "run_time", type: "aggregate", percentile: 50, userSeconds: 1300, benchmarkMedianSeconds: 1200 },
        { segmentKey: "roxzone_time", type: "aggregate", percentile: 55, userSeconds: 100, benchmarkMedianSeconds: 90 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.ok(!htmlBody.includes("Ahead of target"), "analyse mode must not say Ahead of target");
    assert.ok(!htmlBody.includes("Close to target"), "analyse mode must not say Close to target");
  });
});

describe("analyse mode email", () => {
  it("does not use 'subgroup' in athlete-facing email copy", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_75",
        primaryBenchmarkGroup: { label: "Open Men" },
      },
    }), mockContext(), null, "analyse");
    assert.doesNotMatch(htmlBody.toLowerCase(), /subgroup/);
  });

  it("shows OVERALL STANDING (not OVERALL RANK) in metric strip, and Comparison in split table", () => {
    const splitSection = { sectionKey: "race_split_breakdown", title: "Race Split Breakdown", tableData: {} };
    const { htmlBody } = buildEmailReport(
      mockReport([splitSection]),
      mockAnalysis(),
      mockContext(),
      null,
      "analyse",
    );
    assert.match(htmlBody, /OVERALL STANDING/);
    assert.doesNotMatch(htmlBody, /OVERALL RANK/);
    assert.match(htmlBody, /Comparison/);
  });

  it("renders benchmark explanation in analyse mode", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({
      athlete: { division: "Open", gender: "Men" },
      benchmarkContext: {
        achievedBand: "sub_75",
        primaryBenchmarkGroup: { label: "Open Men" },
      },
    }), mockContext(), null, "analyse");
    assert.match(htmlBody, /benchmark band/i);
  });

  it("does not say 'account for' when station gap is greater than total gap", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      mockAnalysis({
        segments: [
          { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2080, timeGapToMedianSeconds: 120, confidence: "high" },
          { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2500, benchmarkMedianSeconds: 2590, timeGapToMedianSeconds: -90, confidence: "high" },
          { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 0, confidence: "high" },
          { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5100, benchmarkMedianSeconds: 5070, timeGapToMedianSeconds: 30, percentile: 45, confidence: "high" },
        ],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.doesNotMatch(htmlBody, /account for.*of your total/i);
  });

  it("includes small-sample note when confidenceLabel is insufficient", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_75",
        confidenceLabel: "insufficient",
        primaryBenchmarkGroup: { label: "Open Men" },
      },
    }), mockContext(), null, "analyse");
    assert.match(htmlBody, /smaller sample size|directional/i);
  });

  it("shows EXECUTION chip for penalty recommendation", () => {
    const report = {
      sections: [{
        sectionKey: "recommended_focus_areas",
        title: "Recommended Focus Areas",
        content: ["1. Penalty avoidance: Clean execution."],
        richRecommendations: [{ title: "Penalty avoidance", category: "Execution", rationale: "Clean execution.", actionId: "penalty_avoidance" }],
      }],
    };
    const { htmlBody } = buildEmailReport(report, mockAnalysis({
      penalties: [{ station: "wall_balls", penaltySeconds: 300 }],
      segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 34, userSeconds: 5612, timeGapToMedianSeconds: 600 }],
    }), mockContext(), null, "analyse");
    assert.match(htmlBody, /EXECUTION/);
  });

  it("does not use 'benchmark group' in analyse-mode email", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({
      benchmarkContext: { achievedBand: "sub_75" },
    }), mockContext(), null, "analyse");
    assert.doesNotMatch(htmlBody.toLowerCase(), /benchmark group/);
  });

  it("does not produce a dangling 'vs the median' fragment in main insight", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_70" },
        segments: [
          { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2080, timeGapToMedianSeconds: 120, confidence: "high" },
          { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2500, benchmarkMedianSeconds: 2590, timeGapToMedianSeconds: -90, confidence: "high" },
          { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 0, confidence: "high" },
          { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5100, benchmarkMedianSeconds: 5070, timeGapToMedianSeconds: 30, percentile: 45, confidence: "high" },
        ],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.equal(htmlBody.match(/\.\s*vs the median/i) !== null, false);
  });

  it("buildGapRelationSentence produces lower-case after prefix comma", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_70" },
      segments: [
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2080, timeGapToMedianSeconds: 120, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2500, benchmarkMedianSeconds: 2607, timeGapToMedianSeconds: -107, frameGapSeconds: -107, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 0, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5100, benchmarkMedianSeconds: 5070, timeGapToMedianSeconds: 30, percentile: 45, confidence: "high" },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.equal(/Against the sub-\d+ benchmark median, [A-Z]/.test(htmlBody), false);
  });

  it("does not say 'main limiter' for sub-60 athletes", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_60" },
        segments: [
          { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2080, timeGapToMedianSeconds: 120, confidence: "high" },
          { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2500, benchmarkMedianSeconds: 2490, timeGapToMedianSeconds: 10, confidence: "high" },
          { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 0, confidence: "high" },
          { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5100, benchmarkMedianSeconds: 5070, timeGapToMedianSeconds: 30, percentile: 99, confidence: "high" },
        ],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.equal(htmlBody.toLowerCase().includes("main limiter"), false);
  });

  it("uses marginal-gain headline for sub-60 athlete", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_60" },
      segments: [
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2080, timeGapToMedianSeconds: 120, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2500, benchmarkMedianSeconds: 2490, timeGapToMedianSeconds: 10, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 0, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5100, benchmarkMedianSeconds: 5070, timeGapToMedianSeconds: 30, percentile: 99, confidence: "high" },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.equal(htmlBody.includes("LEAST ALIGNED SPLIT"), false);
    assert.match(htmlBody, /SUB-60|marginal|MARGINAL/i);
  });

  it("sub-105 athlete sees time range not sub-105 in athlete-facing copy", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_105",
        nextBand: null,
        primaryBenchmarkGroup: { label: "Open Male" },
        confidenceLabel: "high",
      },
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", percentile: 22, userSeconds: 6500, timeGapToMedianSeconds: 655 },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", percentile: 22, timeGapToMedianSeconds: 420 },
        { segmentKey: "run_time", label: "Running", type: "aggregate", percentile: 28, timeGapToMedianSeconds: 235 },
      ],
      roxzoneAnalysis: { available: false },
      penalties: [],
    });
    const { htmlBody } = buildEmailReport(mockReport([splitSection]), analysis, mockContext(), null, "analyse");
    assert.ok(!htmlBody.includes("sub-105 benchmark median"), 'should not contain "sub-105 benchmark median"');
    assert.ok(/100:00\S*104:59/.test(htmlBody), "should contain time range in rendered email");
  });

  it("subject does not say bottleneck in analyse mode", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:open:male:35_39", label: "Open Men 35-39" },
        goalBenchmarkGroup: null,
      },
      segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 10, userSeconds: 3548 }],
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.doesNotMatch(email.subject, /bottleneck/i);
  });

  it("subject uses route framing in target mode with a goal", () => {
    const personal = mockReport();
    const email = buildEmailReport(personal, mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600 },
      },
    }), mockContext(), null, "target");
    assert.match(email.subject, /Your route to 1:00:00/i);
    assert.doesNotMatch(email.subject, /bottleneck/i);
  });

  it("analyse mode HTML does not contain the target benchmark time in BENCHMARK cell", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:open:male:35_39", label: "Open Men 35-39" },
        goalBenchmarkGroup: { key: "sub_60_open_male", targetFinishSeconds: 3600 },
      },
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.doesNotMatch(email.htmlBody, /BENCHMARK<\/span>\s*<span[^>]*>1:00:00/);
    assert.match(email.htmlBody, /Open Men 35-39/);
  });

  it("analyse mode subject uses top-band copy for sub-60 athletes at or below median", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:band:sub_60:open:male", label: "Open Male" },
        achievedBand: "sub_60",
        nextBand: null,
        confidenceLabel: "strong",
        analysisFrame: { frame: "sub60_internal", comparisonBand: "sub_60", stretchBand: null, gapToBandMedianSeconds: 45 },
      },
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.equal(email.subject, "You're sub-60. Here's what separates you from the top of the group.");
  });

  it("analyse mode subject uses percentile copy for sub-60 athletes faster than the median", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 82, userSeconds: 3480 }],
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:band:sub_60:open:male", label: "Open Male" },
        achievedBand: "sub_60",
        nextBand: null,
        confidenceLabel: "strong",
        analysisFrame: { frame: "sub60_internal", comparisonBand: "sub_60", stretchBand: null, gapToBandMedianSeconds: -90 },
      },
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.equal(email.subject, "You're in the top 18% of sub-60 finishers. Here's the next refinement.");
  });

  it("analyse mode hero includes comparison group context line", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:band:sub_85:open:male", label: "Open Male", sampleSize: 13587 },
        achievedBand: "sub_85",
        nextBand: "sub_80",
        confidenceLabel: "strong",
        analysisFrame: { frame: "catch_up", comparisonBand: "sub_85", stretchBand: null, gapToBandMedianSeconds: 120 },
      },
    });
    const email = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");
    assert.match(email.htmlBody, /Compared against 13,587 80:00.84:59 finishers/);
  });

  it("analyse mode subject points to the next faster band when one exists", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:band:sub_75:open:male", label: "Open Male" },
        achievedBand: "sub_75",
        nextBand: "sub_70",
        confidenceLabel: "strong",
      },
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.equal(email.subject, "You're in the sub-75 band. Here's the route to sub-70.");
  });

  it("analyse mode metric strip marks insufficient band confidence as directional", () => {
    const personal = mockReport();
    const analysis = mockAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:band:sub_65:open:female", label: "Open Female" },
        achievedBand: "sub_65",
        nextBand: "sub_60",
        confidenceLabel: "insufficient",
      },
    });
    const email = buildEmailReport(personal, analysis, mockContext(), null, "analyse");
    assert.match(email.htmlBody, /sub-65 - Open Female \(directional\)/);
  });

  it("next_band frame subject references ahead of group and target band", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_70",
        nextBand: "sub_65",
        analysisFrame: { frame: "next_band", comparisonBand: "sub_65", stretchBand: null, gapToBandMedianSeconds: -63 },
        primaryBenchmarkGroup: { label: "sub-70 Open Male" },
      },
      segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 35, userSeconds: 4047 }],
    });
    const email = buildEmailReport(mockReport(), analysis, mockContext(), null, "analyse");
    assert.match(email.subject, /ahead/i);
    assert.match(email.subject, /sub-65/i);
  });

  it("analyse mode CTA references marginal gains not bottleneck", () => {
    const personal = mockReport();
    const email = buildEmailReport(personal, mockAnalysis(), mockContext(), { primaryThesis: { category: "high_performer" } }, "analyse");
    assert.doesNotMatch(email.htmlBody, /targeting your bottleneck/i);
    assert.match(email.htmlBody, /marginal gains|preserv/i);
  });

  it("analyse mode includes the primary target-time CTA", () => {
    const email = buildEmailReport(mockReport(), mockAnalysis(), mockContext(), null, "analyse");

    assert.match(email.htmlBody, /Want to work towards a target time\?/);
    assert.match(email.htmlBody, /mode=target/);
  });

  it("primary target-time CTA uses FORMA_APP_BASE_URL when configured", () => {
    const previous = process.env.FORMA_APP_BASE_URL;
    process.env.FORMA_APP_BASE_URL = "http://localhost:5173";
    try {
      const email = buildEmailReport(mockReport(), mockAnalysis(), mockContext(), null, "analyse");

      assert.match(email.htmlBody, /http:\/\/localhost:5173\/hyrox-calculator\/race-details\?mode=target&amp;source=email/);
    } finally {
      if (previous === undefined) {
        delete process.env.FORMA_APP_BASE_URL;
      } else {
        process.env.FORMA_APP_BASE_URL = previous;
      }
    }
  });

  it("primary target-time CTA carries submissionId when available", () => {
    const email = buildEmailReport(
      mockReport(),
      mockAnalysis({ submissionId: "11111111-1111-4111-8111-111111111111" }),
      mockContext(),
      null,
      "analyse",
    );

    assert.match(email.htmlBody, /submissionId=11111111-1111-4111-8111-111111111111/);
  });

  it("target mode includes the different-target-time primary CTA", () => {
    const email = buildEmailReport(
      mockReport(),
      mockAnalysis({
        submissionId: "11111111-1111-4111-8111-111111111111",
        carouselUrl: "https://example.com/carousel",
      }),
      mockContext(),
      null,
      "target",
    );

    const targetIndex = email.htmlBody.indexOf("Want to work towards a different target time?");
    const carouselIndex = email.htmlBody.indexOf("View your shareable carousel");
    assert.ok(targetIndex >= 0, "different-target-time CTA should appear");
    assert.ok(carouselIndex >= 0, "carousel CTA should appear");
    assert.ok(targetIndex < carouselIndex, "different-target-time CTA should be primary before carousel CTA");
    assert.match(email.htmlBody, /mode=target/);
    assert.match(email.htmlBody, /submissionId=11111111-1111-4111-8111-111111111111/);
    assert.doesNotMatch(email.htmlBody, /BUILD MY HYROX TRAINING PLAN/);
  });

  it("analyse email orders target-time CTA before carousel link", () => {
    const email = buildEmailReport(
      mockReport(),
      mockAnalysis({
        submissionId: "11111111-1111-4111-8111-111111111111",
        carouselUrl: "https://example.com/carousel",
      }),
      mockContext(),
      null,
      "analyse",
    );

    const targetIndex = email.htmlBody.indexOf("Want to work towards a target time?");
    const carouselIndex = email.htmlBody.indexOf("View your shareable carousel");
    assert.ok(targetIndex >= 0, "target-time CTA should appear");
    assert.ok(carouselIndex >= 0, "carousel CTA should appear");
    assert.ok(targetIndex < carouselIndex, "target-time CTA should be primary before carousel CTA");
    assert.doesNotMatch(email.htmlBody, /BUILD MY HYROX TRAINING PLAN/);
  });
});

describe("renderSplitTable", () => {
  const splitSection = { sectionKey: "race_split_breakdown", title: "Race Split Breakdown", tableData: {} };
  const analysisWithFullSplits = {
    race: { finishTimeSeconds: 5762 },
    segments: [
      { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 310, benchmarkMedianSeconds: 290, timeGapToMedianSeconds: 20, percentile: 55, confidence: "high" },
      { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 578, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 278, percentile: 8, confidence: "high" },
      { segmentKey: "run_time", label: "Total Running", type: "aggregate", userSeconds: 2400, benchmarkMedianSeconds: 2100, timeGapToMedianSeconds: 300, confidence: "high" },
      { segmentKey: "work_time", label: "Total Stations", type: "aggregate", userSeconds: 2700, benchmarkMedianSeconds: 2100, timeGapToMedianSeconds: 600, confidence: "high" },
      { segmentKey: "roxzone_time", label: "Total RoxZone", type: "aggregate", userSeconds: 420, benchmarkMedianSeconds: 400, timeGapToMedianSeconds: 20, confidence: "high" },
      { segmentKey: "total_time", label: "Total Race Time", type: "aggregate", userSeconds: 5762, benchmarkMedianSeconds: 4800, timeGapToMedianSeconds: 962, confidence: "high" },
    ],
    benchmarkContext: { primaryBenchmarkGroup: { label: "Open Male benchmark" } },
    penalties: [],
    stationBreakdown: [],
  };

  const raceOrder = [
    ["run_1", "Run 1", "run"],
    ["ski_erg", "SkiErg", "station"],
    ["run_2", "Run 2", "run"],
    ["sled_push", "Sled Push", "station"],
    ["run_3", "Run 3", "run"],
    ["sled_pull", "Sled Pull", "station"],
    ["run_4", "Run 4", "run"],
    ["burpee_broad_jump", "Burpee Broad Jump", "station"],
    ["run_5", "Run 5", "run"],
    ["row", "Row", "station"],
    ["run_6", "Run 6", "run"],
    ["farmers_carry", "Farmers Carry", "station"],
    ["run_7", "Run 7", "run"],
    ["sandbag_lunges", "Sandbag Lunges", "station"],
    ["run_8", "Run 8", "run"],
    ["wall_balls", "Wall Balls", "station"],
  ];

  function splitSegment(segmentKey, label, type, gapSeconds, overrides = {}) {
    const target = type === "run" ? 300 : 120;
    return {
      segmentKey,
      label,
      type,
      userSeconds: target + gapSeconds,
      benchmarkMedianSeconds: target + 20,
      goalBenchmarkSeconds: target,
      timeGapToMedianSeconds: gapSeconds + 20,
      confidence: "high",
      ...overrides,
    };
  }

  function splitTableSection({ overrides = {}, penalties = [], benchmarkContext, targetFinishTimeSeconds = null, omitSegmentKeys = [] } = {}) {
    const omitted = new Set(omitSegmentKeys);
    const segments = raceOrder.map(([key, label, type], index) => {
      const baseGap = index === 1 ? 120 : index === 3 ? 80 : index === 5 ? -30 : 10;
      return splitSegment(key, label, type, baseGap, overrides[key]);
    }).filter((segment) => !omitted.has(segment.segmentKey));
    [
      splitSegment("run_time", "Run Time", "aggregate", 60, overrides.run_time),
      splitSegment("work_time", "Work Time", "aggregate", 240, overrides.work_time),
      splitSegment("roxzone_time", "RoxZone Time", "aggregate", 45, overrides.roxzone_time),
      splitSegment("total_time", "Total Time", "aggregate", 300, overrides.total_time),
    ].forEach((segment) => {
      if (!omitted.has(segment.segmentKey)) segments.push(segment);
    });
    return {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      content: [],
      tableData: {
        segments,
        penalties,
        benchmarkContext: benchmarkContext ?? {
          goalBenchmarkGroup: { label: "Goal 80-85 min" },
          primaryBenchmarkGroup: { label: "Open Men 30-39" },
        },
        targetFinishTimeSeconds,
      },
    };
  }

  function renderSplit(overrides = {}, calculatorMode = "target") {
    const section = splitTableSection(overrides);
    return buildEmailReport(
      { sections: [section] },
      mockAnalysis({
        submissionId: "22222222-2222-4222-8222-222222222222",
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
      calculatorMode,
    ).htmlBody;
  }

  function renderRoxZoneGap(roxGapSeconds) {
    return renderSplit({
      overrides: {
        roxzone_time: {
          label: "Total RoxZone",
          userSeconds: 205,
          timeGapToExactTargetSeconds: roxGapSeconds,
          percentile: null,
        },
      },
    });
  }

	  it("does not show raw percentile in opportunity rows", () => {
	    const htmlBody = renderSplit({
	      benchmarkContext: {
	        primaryBenchmarkGroup: { label: "Open Men 30-39" },
	      },
	      overrides: {
	        wall_balls: {
          timeGapToMedianSeconds: 121,
          frameGapSeconds: 121,
          percentile: 15,
          fieldPercentile: 15,
        },
      },
    });
    const priorityIdx = htmlBody.indexOf("Priority vs your benchmark band");
    assert.ok(priorityIdx > -1, "expected opportunity row to show band score label");
    const rowHtml = htmlBody.slice(Math.max(0, priorityIdx - 260), priorityIdx + 260);
    assert.equal(rowHtml.includes("15th percentile"), false);
	  });
	
	  it("uses athlete-facing subtitle for biggest opportunities panel", () => {
		    const htmlBody = renderSplit({
		      benchmarkContext: {
		        primaryBenchmarkGroup: { label: "Open Men 30-39" },
	      },
	    });
	    assert.match(htmlBody, /Where the next time comes from/i);
    assert.equal(htmlBody.includes("Top 3 segments by time gap"), false);
    assert.equal(htmlBody.includes("Top 2 segments by time gap"), false);
	    assert.equal(htmlBody.includes("Top segment by time gap"), false);
	  });

	  it("caps target-mode biggest opportunities at three rows", () => {
	    const htmlBody = renderSplit({
	      overrides: {
	        ski_erg: { timeGapToExactTargetSeconds: 180 },
	        sled_push: { timeGapToExactTargetSeconds: 160 },
	        sled_pull: { timeGapToExactTargetSeconds: 140 },
	        burpee_broad_jumps: { timeGapToExactTargetSeconds: 120 },
	        rowing: { timeGapToExactTargetSeconds: 100 },
	      },
	    }, "target");
	    const panelHtml = htmlBody.slice(htmlBody.indexOf("Biggest opportunities"), htmlBody.indexOf("Strengths to protect"));
	    const opportunityCount = (panelHtml.match(/Target opportunity|Main target opportunity/g) ?? []).length;
	    assert.equal(opportunityCount, 3);
	    assert.equal(panelHtml.includes("Burpee Broad Jumps"), false);
	  });

  it("shows softer opportunity label for sub-60 athlete in segment highlights", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_60",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        wall_balls: {
          timeGapToMedianSeconds: 121,
          frameGapSeconds: 121,
          percentile: 15,
          fieldPercentile: 15,
        },
      },
    }, "analyse");
	    assert.equal(htmlBody.includes("Priority vs your benchmark band"), false);
	    assert.match(htmlBody, /Next refinement|Marginal gain/i);
	  });

  it("uses refinement wording and amber severity for small sub-60 benchmark gaps", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_60",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        sandbag_lunges: {
          userSeconds: 166,
          benchmarkMedianSeconds: 120,
          timeGapToMedianSeconds: 46,
          frameGapSeconds: 46,
          percentile: 15,
          fieldPercentile: 15,
        },
        work_time: {
          userSeconds: 166,
          benchmarkMedianSeconds: 120,
          timeGapToMedianSeconds: 46,
          frameGapSeconds: 46,
        },
        total_time: {
          timeGapToMedianSeconds: 46,
          frameGapSeconds: 46,
        },
      },
    }, "analyse");
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const sandbagSnippet = detailHtml.slice(detailHtml.indexOf("Sandbag Lunges") - 260, detailHtml.indexOf("Sandbag Lunges") + 520);
    assert.match(sandbagSnippet, /Next refinement/);
    assert.doesNotMatch(sandbagSnippet, /Priority/);

    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    assert.match(profileHtml, /background-color:#f59e0b|background-color:#d97706/);
    assert.doesNotMatch(profileHtml, /background-color:#ef4444/);
  });

  it("segment profile colors use gap sign for sub-70 analyse gaps", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_70",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        work_time: {
          timeGapToMedianSeconds: 88,
          frameGapSeconds: 88,
        },
        run_time: {
          timeGapToMedianSeconds: -107,
          frameGapSeconds: -107,
        },
        roxzone_time: {
          timeGapToMedianSeconds: 87,
          frameGapSeconds: 87,
        },
        total_time: {
          timeGapToMedianSeconds: 68,
          frameGapSeconds: 68,
        },
      },
    }, "analyse");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    const snippetFor = (label) => {
      const idx = profileHtml.indexOf(label);
      return profileHtml.slice(Math.max(0, idx - 180), idx + 120);
    };
    assert.match(snippetFor("Stations"), /background-color:#ef4444|background-color:#e53e3e/);
    assert.match(snippetFor("Running"), /background-color:#22c55e/);
    assert.match(snippetFor("RoxZone"), /background-color:#f59e0b/);
    assert.doesNotMatch(snippetFor("RoxZone"), /background-color:#22c55e/);
  });

  it("segment profile station legend shows the true negative station gap", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_90",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        work_time: {
          timeGapToMedianSeconds: -862,
          frameGapSeconds: -862,
        },
        run_time: {
          timeGapToMedianSeconds: 1000,
          frameGapSeconds: 1000,
        },
        roxzone_time: {
          timeGapToMedianSeconds: 0,
          frameGapSeconds: 0,
        },
        total_time: {
          timeGapToMedianSeconds: 138,
          frameGapSeconds: 138,
        },
      },
    }, "analyse");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    const stationsSnippet = profileHtml.slice(profileHtml.indexOf("Stations") - 180, profileHtml.indexOf("Stations") + 160);
    assert.match(stationsSnippet, /Stations -14:22|Stations −14:22/);
    assert.doesNotMatch(stationsSnippet, /Stations 0:00/);
  });

  it("segment profile colors positive RoxZone target gaps as non-green", () => {
    const htmlBody = renderSplit({
      overrides: {
        work_time: {
          timeGapToExactTargetSeconds: 120,
        },
        run_time: {
          timeGapToExactTargetSeconds: -30,
        },
        roxzone_time: {
          timeGapToExactTargetSeconds: 87,
        },
        total_time: {
          timeGapToExactTargetSeconds: 177,
        },
      },
    }, "target");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    const roxSnippet = profileHtml.slice(profileHtml.indexOf("RoxZone") - 180, profileHtml.indexOf("RoxZone") + 120);
    assert.match(roxSnippet, /background-color:#f59e0b/);
    assert.doesNotMatch(roxSnippet, /background-color:#22c55e/);
  });

  it("segment profile gives major station and running gaps distinct colours", () => {
    const htmlBody = renderSplit({
      overrides: {
        work_time: {
          timeGapToExactTargetSeconds: 180,
        },
        run_time: {
          timeGapToExactTargetSeconds: 150,
        },
        roxzone_time: {
          timeGapToExactTargetSeconds: 75,
        },
        total_time: {
          timeGapToExactTargetSeconds: 405,
        },
      },
    }, "target");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    const snippetFor = (label) => {
      const idx = profileHtml.indexOf(label);
      return profileHtml.slice(Math.max(0, idx - 180), idx + 120);
    };
    assert.match(snippetFor("Stations"), /background-color:#ef4444|background-color:#e53e3e/);
    assert.match(snippetFor("Running"), /background-color:#2563eb/);
    assert.match(snippetFor("RoxZone"), /background-color:#f59e0b/);
  });

  it("segment profile colors negative RoxZone target gaps as green", () => {
    const htmlBody = renderSplit({
      overrides: {
        work_time: {
          timeGapToExactTargetSeconds: 120,
        },
        run_time: {
          timeGapToExactTargetSeconds: 30,
        },
        roxzone_time: {
          timeGapToExactTargetSeconds: -30,
        },
        total_time: {
          timeGapToExactTargetSeconds: 120,
        },
      },
    }, "target");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    const roxSnippet = profileHtml.slice(profileHtml.indexOf("RoxZone") - 180, profileHtml.indexOf("RoxZone") + 120);
    assert.match(roxSnippet, /background-color:#22c55e/);
  });

  it("flags impossible-fast station splits and avoids confident main-limiter wording", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_90",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        sandbag_lunges: {
          userSeconds: 3,
          benchmarkMedianSeconds: 186,
          timeGapToMedianSeconds: -183,
          frameGapSeconds: -183,
          percentile: 95,
        },
        work_time: {
          userSeconds: 2114,
          benchmarkMedianSeconds: 2100,
          timeGapToMedianSeconds: 14,
          frameGapSeconds: 14,
        },
        run_time: {
          userSeconds: 1947,
          benchmarkMedianSeconds: 2100,
          timeGapToMedianSeconds: -153,
          frameGapSeconds: -153,
        },
        roxzone_time: {
          userSeconds: 405,
          benchmarkMedianSeconds: 180,
          timeGapToMedianSeconds: 225,
          frameGapSeconds: 225,
          percentile: 5,
        },
        total_time: {
          userSeconds: 4656,
          benchmarkMedianSeconds: 4416,
          timeGapToMedianSeconds: 240,
          frameGapSeconds: 240,
        },
      },
    }, "analyse");
    const insightHtml = htmlBody.slice(htmlBody.indexOf("MAIN INSIGHT"), htmlBody.indexOf("SEGMENT PROFILE"));
    assert.match(insightHtml, /split values look unusual|directional until those times are checked/i);
    assert.doesNotMatch(insightHtml, /largest positive gap is stations|stations are the largest contributor/i);

    const profileHtml = htmlBody.slice(htmlBody.indexOf("Biggest opportunities"), htmlBody.indexOf("Strengths to protect"));
    assert.match(profileHtml, /unusually large gap|double-check/i);
  });

  it("suppresses impossible-fast station splits from the strengths panel", () => {
    const htmlBody = renderSplit({
      overrides: {
        sandbag_lunges: {
          userSeconds: 3,
          goalBenchmarkSeconds: 182,
          timeGapToExactTargetSeconds: -179,
          frameGapSeconds: -179,
          percentile: 95,
        },
      },
    }, "target");

    const strengthsHtml = htmlBody.slice(htmlBody.indexOf("Strengths to protect"), htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.doesNotMatch(strengthsHtml, /STRONG[\s\S]*Sandbag Lunges/i);
    assert.doesNotMatch(strengthsHtml, /Sandbag Lunges[\s\S]*Ahead of target[\s\S]*−2:59/i);
    assert.match(strengthsHtml, /strong-looking splits are affected by unusual data/i);
  });

  it("segment profile does not render green when all aggregate gaps are positive", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        work_time: {
          timeGapToMedianSeconds: 120,
          frameGapSeconds: 120,
        },
        run_time: {
          timeGapToMedianSeconds: 45,
          frameGapSeconds: 45,
        },
        roxzone_time: {
          timeGapToMedianSeconds: 30,
          frameGapSeconds: 30,
        },
        total_time: {
          timeGapToMedianSeconds: 195,
          frameGapSeconds: 195,
        },
      },
    }, "analyse");
    const profileHtml = htmlBody.slice(htmlBody.indexOf("SEGMENT PROFILE"), htmlBody.indexOf("Strengths to protect"));
    assert.doesNotMatch(profileHtml, /background-color:#22c55e/);
  });

  it("references next band in main insight for sub-70 athlete", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_70",
        nextBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        run_time: {
          timeGapToMedianSeconds: -107,
          frameGapSeconds: -107,
        },
        work_time: {
          timeGapToMedianSeconds: 120,
          frameGapSeconds: 120,
        },
        total_time: {
          timeGapToMedianSeconds: 0,
          frameGapSeconds: 0,
        },
      },
    }, "analyse");
    assert.match(htmlBody, /sub-65/i);
  });

  it("labels a negative-gap running segment as Strength not Secondary limiter", () => {
    const htmlBody = renderSplit({
      overrides: {
        run_time: {
          userSeconds: 2400,
          timeGapToMedianSeconds: -107,
          frameGapSeconds: -107,
        },
      },
    });
    assert.equal(htmlBody.includes("Secondary limiter"), false);
    assert.match(htmlBody, /Strength/);
  });

  it("does not pair a STRONG badge with priority wording for faster benchmark rows", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
      overrides: {
        sled_pull: {
          userSeconds: 75,
          benchmarkMedianSeconds: 120,
          timeGapToMedianSeconds: -45,
          frameGapSeconds: -45,
          percentile: 10,
          fieldPercentile: 10,
        },
      },
    }, "analyse");
    const strengthsHtml = htmlBody.slice(htmlBody.indexOf("Strengths to protect"), htmlBody.indexOf("FULL SPLIT DETAIL"));
    const sledStrengthSnippet = strengthsHtml.slice(strengthsHtml.indexOf("Sled Pull") - 320, strengthsHtml.indexOf("Sled Pull") + 420);
    assert.match(sledStrengthSnippet, /STRONG/);
    assert.match(sledStrengthSnippet, /Strength vs your benchmark band/);
    assert.doesNotMatch(sledStrengthSnippet, /Priority vs your benchmark band/);

    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const sledDetailSnippet = detailHtml.slice(detailHtml.indexOf("Sled Pull") - 260, detailHtml.indexOf("Sled Pull") + 520);
    assert.match(sledDetailSnippet, /Strength/);
    assert.doesNotMatch(sledDetailSnippet, /Priority/);
  });

	  it("renders full split detail", () => {
	    const htmlBody = renderSplit();
	    assert.match(htmlBody, /FULL SPLIT DETAIL/);
	    assert.match(htmlBody, /View the full split report/);
	    assert.match(htmlBody, /\/api\/hyrox\/carousel\/22222222-2222-4222-8222-222222222222/);
	    assert.ok(!htmlBody.includes("REDUCED SPLIT DETAIL"));
	  });

  it("omits full split report link when no submission id exists", () => {
    const section = splitTableSection();
    const { htmlBody } = buildEmailReport(
      { sections: [section] },
      mockAnalysis({
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
    );
    assert.ok(!htmlBody.includes("View the full split report"));
  });

  it("renders full rows in race order", () => {
	    const htmlBody = renderSplit();
	    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
	    const labels = [
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
	    ];
	    let previousIndex = -1;
	    for (const label of labels) {
	      const index = detailHtml.indexOf(`>${label}<`);
	      assert.ok(index > previousIndex, `${label} should appear in race order`);
	      previousIndex = index;
	    }
	  });

  it("full split detail uses escalation-basis medians for penalty-adjusted reclassification-only analyse frames", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        achievedBand: "sub_80",
        escalationBasisBand: "sub_75",
        nextBand: "sub_70",
        analysisFrame: { frame: "catch_up", comparisonBand: "sub_75", stretchBand: null, gapToBandMedianSeconds: 65 },
        primaryBenchmarkGroup: { label: "Open Female", sampleSize: 4200 },
        escalationBasisBandGroup: { label: "Open Female", sampleSize: 7200 },
        nextBandGroup: { label: "Open Female", sampleSize: 10725 },
      },
      overrides: {
        run_1: {
          userSeconds: 290,
          benchmarkMedianSeconds: 266,
          nextBandMedianSeconds: 251,
          timeGapToMedianSeconds: 24,
          timeGapToNextBandMedianSeconds: 39,
          frameGapSeconds: 39,
        },
      },
    }, "analyse");
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const run1Snippet = detailHtml.slice(detailHtml.indexOf("Run 1") - 260, detailHtml.indexOf("Run 1") + 620);

    assert.match(detailHtml, /Gap vs sub-75/);
    assert.match(run1Snippet, />4:11</, "Comparison should use the escalation-basis sub-75 median");
    assert.doesNotMatch(run1Snippet, />4:26</, "Comparison should not use the raw achieved sub-80 median");
    assert.match(run1Snippet, /\+0:39/);
  });

  it("does not render aggregate rows in full detail", () => {
    const htmlBody = renderSplit();
    assert.equal(htmlBody.includes(">Total Running<"), false);
    assert.equal(htmlBody.includes(">Total Stations<"), false);
    assert.equal(htmlBody.includes(">Total RoxZone<"), false);
    assert.equal(htmlBody.includes(">Total Race Time<"), false);
  });

  it("anchors total race target to the submitted target finish time", () => {
    const htmlBody = renderSplit({
      targetFinishTimeSeconds: 4800,
      overrides: {
        total_time: {
          userSeconds: 5738,
          goalBenchmarkSeconds: 4446,
          exactTargetSeconds: 4800,
          timeGapToExactTargetSeconds: 938,
        },
      },
    });
    assert.match(htmlBody, />1:20:00</);
    assert.match(htmlBody, /\+15:38/);
  });

  it("uses current target feasibility wording for 3-6 minute target gaps", () => {
    const htmlBody = renderSplit({
      targetFinishTimeSeconds: 3600,
      overrides: {
        total_time: {
          userSeconds: 3953,
          exactTargetSeconds: 3600,
          goalBenchmarkSeconds: 3600,
          timeGapToExactTargetSeconds: 353,
        },
        run_time: {
          timeGapToExactTargetSeconds: 305,
        },
        work_time: {
          timeGapToExactTargetSeconds: 189,
        },
      },
    }, "target");

    assert.match(htmlBody, /Target assessment: meaningful stretch/);
    assert.doesNotMatch(htmlBody, /ambitious but plausible/);
  });

  it("highlights the biggest positive gaps and faster splits", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /#2a1114/);
    assert.match(htmlBody, /#22c55e/);
    assert.match(htmlBody, /\+2:00/);
    assert.match(htmlBody, /\u22120:30/);
  });

  it("renders penalties in full detail when present", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes(">Penalties<"));
    assert.match(htmlBody, /\+5:00/);
  });

  it("omits penalty row when there are no penalties", () => {
    const htmlBody = renderSplit();
    assert.equal(htmlBody.includes(">Penalties<"), false);
  });

  it("no penalties: keeps the compact 4-card layout without adjusted penalty framing", () => {
    const htmlBody = renderSplit({ penalties: [] });
    assert.ok(!htmlBody.includes("Without penalties"), "no Adjusted card when no penalties");
    assert.ok(!htmlBody.includes("Fastest win"), "no Penalties card when no penalties");
    assert.ok(!htmlBody.includes("Net of penalties"), "running note should stay unchanged when no penalties");
  });

  it("target mode: summary cards (Race time / Stations / Running / RoxZone) carry their own may-not-sum caveat", () => {
    const htmlBody = renderSplit({}, "target");
    const raceTimeCardIdx = htmlBody.indexOf(">Race time<");
    assert.ok(raceTimeCardIdx > -1, "Race time summary card should exist");
    const caveatIdx = htmlBody.indexOf("may not sum exactly to the total target gap", raceTimeCardIdx);
    assert.ok(caveatIdx > -1, "a may-not-sum caveat should appear after the summary cards, not just earlier in SEGMENT PROFILE");
    const nextSectionIdx = htmlBody.indexOf("TARGET PRIORITIES", raceTimeCardIdx);
    assert.ok(nextSectionIdx === -1 || caveatIdx < nextSectionIdx, "caveat should sit within the summary cards block, before the next section");
  });

  it("analyse mode: summary cards carry their own may-not-sum caveat", () => {
    const htmlBody = renderSplit({}, "analyse");
    const raceTimeCardIdx = htmlBody.indexOf(">Race time<");
    assert.ok(raceTimeCardIdx > -1, "Race time summary card should exist");
    const caveatIdx = htmlBody.indexOf("may not sum exactly to the total race gap", raceTimeCardIdx);
    assert.ok(caveatIdx > -1, "a may-not-sum caveat should appear after the summary cards in analyse mode too");
  });

  it("material penalties on a station: renders adjusted and penalty summary cards, but Running is not falsely labeled net of penalties", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Without penalties"), "Adjusted card should appear");
    assert.ok(htmlBody.includes("Fastest win"), "Penalties card should appear");
    assert.ok(!htmlBody.includes("Net of penalties"), "Running card should not claim net-of-penalties when the penalty is on a station");
  });

  it("material penalties on a run: Running summary card correctly says Net of penalties", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_3", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Net of penalties"), "Running card should say Net of penalties when the penalty really is on a run");
  });

  it("material penalties on a station: segment profile includes purple penalty attribution but does not falsely claim running is net of penalties", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("#8b5cf6"), "purple penalty colour should appear");
    assert.ok(!htmlBody.includes("Running is shown net of penalties"), "should not claim running is net of penalties when the penalty is on a station");
    assert.ok(htmlBody.includes("Penalties are shown separately from performance gaps"), "should use the generic penalty-separation footer instead");
    assert.ok(htmlBody.includes("may not sum exactly to the total race gap"), "segment profile should carry the independence note");
  });

  it("material penalties on a run: segment profile explains running is net of penalties", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_3", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Running is shown net of penalties"), "segment profile should explain net running when the penalty really is on a run");
  });

	  it("material penalties: penalty row appears before segment rows in full split table", () => {
	    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
	    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
	    const penaltyIdx = detailHtml.indexOf(">Penalties<");
	    const firstSegmentIdx = detailHtml.indexOf(">Run 1<");
	    assert.ok(penaltyIdx > -1, "penalty row should exist");
	    assert.ok(firstSegmentIdx > -1, "first segment row should exist");
	    assert.ok(penaltyIdx < firstSegmentIdx, "penalty row should appear before segment rows");
  });

  it("material penalties: penalty appears first in biggest opportunities panel", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const panelIdx = htmlBody.indexOf("Penalty separated from split performance");
    assert.ok(panelIdx > -1, "Biggest opportunities panel should exist");
    const snippet = htmlBody.slice(panelIdx, panelIdx + 3000);
    assert.ok(snippet.includes("Penalties"), "Penalties should appear in the opportunities panel");
    assert.ok(snippet.indexOf("Penalties") < snippet.indexOf("SkiErg"), "Penalties should be the first opportunity");
  });

  it("material penalties on a station: MAIN INSIGHT names the actual penalized segment, not a hardcoded run", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] }, "analyse");
    assert.doesNotMatch(htmlBody, /Run 5 is penalty-inflated/);
    assert.doesNotMatch(htmlBody, /running gap drops/);
    assert.match(htmlBody, /penalty is on Wall Balls, not running/);
  });

  it("material penalties on a run: MAIN INSIGHT still nets the running gap and names the actual penalized run", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_3", penaltySeconds: 300 }] }, "analyse");
    assert.match(htmlBody, /running gap drops/);
    assert.match(htmlBody, /Run 3 is penalty-inflated/);
    assert.doesNotMatch(htmlBody, /Run 5 is penalty-inflated/);
  });

  it("material penalties: MAIN INSIGHT gap sentence names the resolved comparison band, not the raw achieved band", () => {
    const htmlBody = renderSplit({
      penalties: [{ station: "wall_balls", penaltySeconds: 300 }],
      benchmarkContext: {
        achievedBand: "sub_80",
        analysisFrame: { comparisonBand: "sub_75" },
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
    }, "analyse");
    const insightHtml = htmlBody.slice(htmlBody.indexOf("MAIN INSIGHT"), htmlBody.indexOf("SEGMENT PROFILE"));
    assert.match(insightHtml, /Against the sub-75 benchmark median/);
    assert.doesNotMatch(insightHtml, /Against the sub-80 benchmark median/);
  });

  it("material penalties on a station: TARGET PRIORITIES skip list does not falsely claim a run is penalty-inflated", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] }, "target");
    assert.doesNotMatch(htmlBody, /as pure running fitness - it is penalty-inflated/);
  });

  it("material penalties on a run: TARGET PRIORITIES skip list names the actual penalized run", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_3", penaltySeconds: 300 }] }, "target");
    assert.match(htmlBody, /Run 3 as pure running fitness - it is penalty-inflated/);
  });

  it("material penalties: penalty-inflated split is adjusted before opportunity ranking", () => {
    const htmlBody = renderSplit({
      penalties: [{ station: "run_5", penaltySeconds: 300 }],
      overrides: {
        run_5: { userSeconds: 528, goalBenchmarkSeconds: 300, timeGapToMedianSeconds: 248 },
      },
    });
    const panelIdx = htmlBody.indexOf("Penalty separated from split performance");
    const panelSnippet = htmlBody.slice(panelIdx, panelIdx + 3000);
    assert.ok(panelSnippet.includes("Penalties"), "penalty remains the first execution opportunity");
	    assert.ok(!panelSnippet.includes("Run 5"), "Run 5 should not rank as a top weakness after penalty adjustment");

	    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
	    assert.ok(detailHtml.includes("Run 5"), "Run 5 should still appear in the full split table");
	    assert.ok(detailHtml.includes("penalty-adjusted from +3:48"));
	    assert.ok(detailHtml.includes(">3:48<"), "Your time should be shown without the 5:00 penalty");
	    assert.ok(detailHtml.includes("−1:12"), "Gap should be shown without the 5:00 penalty");
	    assert.ok(detailHtml.includes("Penalty time is shown separately above, so the split table focuses on performance gaps rather than execution penalties."));
	  });

  it("material penalties: full split detail shows adjusted numbers when a penalty split remains a gap", () => {
    const htmlBody = renderSplit({
      penalties: [{ segmentKey: "run_5", penaltySeconds: 300 }],
      overrides: {
        run_5: { userSeconds: 680, goalBenchmarkSeconds: 300, timeGapToMedianSeconds: 400 },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.ok(detailHtml.includes("Run 5"));
    assert.ok(detailHtml.includes("penalty-adjusted from +6:20"));
    assert.ok(detailHtml.includes(">6:20<"), "Your time should be shown without the 5:00 penalty");
    assert.ok(detailHtml.includes("+1:20"), "Gap should be shown without the 5:00 penalty");
  });

  it("full split detail uses amber background for amber gaps", () => {
    const htmlBody = renderSplit({
      overrides: {
        farmers_carry: { userSeconds: 187, goalBenchmarkSeconds: 120, timeGapToMedianSeconds: 87 },
        sled_push: { userSeconds: 182, goalBenchmarkSeconds: 120, timeGapToMedianSeconds: 82 },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const rowSnippet = (label) => {
      const labelIndex = detailHtml.indexOf(label);
      const rowStart = detailHtml.lastIndexOf("<tr", labelIndex);
      const rowEnd = detailHtml.indexOf("</tr>", labelIndex);
      return detailHtml.slice(rowStart, rowEnd);
    };
    const farmersSnippet = rowSnippet("Farmers Carry");
    const sledSnippet = rowSnippet("Sled Push");
    assert.ok(farmersSnippet.includes("background-color:#2c1e07"), "Farmers Carry +1:07 should use dark amber background");
    assert.ok(farmersSnippet.includes("color:#f59e0b"), "Farmers Carry +1:07 should use amber text");
    assert.ok(!farmersSnippet.includes("background-color:#2a1114"), "Farmers Carry +1:07 should not use red background");
    assert.ok(sledSnippet.includes("background-color:#2c1e07"), "Sled Push +1:02 should use dark amber background");
  });

  it("dominating penalties: hero headline uses penalty framing", () => {
    const section = splitTableSection({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const { htmlBody } = buildEmailReport(
      { sections: [section] },
      mockAnalysis({
        headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 600, percentile: 34 } },
        timePotential: { headlineGainSeconds: 600 },
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
    );
    assert.ok(htmlBody.includes("5:00 OF PENALTIES IS YOUR FASTEST WIN"));
    assert.ok(htmlBody.includes("Clean this up before chasing fitness gains."));
  });

  it("dominating penalties: title and snapshot strip use penalty-adjusted framing", () => {
    const section = splitTableSection({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const { htmlBody, subject } = buildEmailReport(
      { sections: [section] },
      mockAnalysis({
        headline: { biggestLimiter: { label: "Sandbag Lunges", segmentKey: "sandbag_lunges", timeGapSeconds: 600, percentile: 34 } },
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
    );
    assert.equal(subject, "Your HYROX fastest win is 5:00 of penalties");
    assert.ok(htmlBody.includes("<title>Your HYROX fastest win is 5:00 of penalties</title>"));
    const stripStart = htmlBody.indexOf("YOUR RACE");
    const stripHtml = htmlBody.slice(stripStart, stripStart + 1800);
    assert.ok(stripHtml.includes("ADJUSTED"));
    assert.ok(stripHtml.includes("TARGET GAP"));
    assert.ok(!stripHtml.includes("BENCHMARK"));
  });

  it("material penalties: penalty callout renders adjusted time once with execution wording", () => {
    const penaltySection = {
      sectionKey: "penalty_callout",
      title: "Penalty Analysis",
      content: [
        "5:00 in penalties recorded. Your adjusted race time was 1:30:38.",
        "Adjusted race time without penalties: 1:30:38.",
      ],
    };
    const { htmlBody } = buildEmailReport(
      { sections: [penaltySection] },
      mockAnalysis({
        race: { finishTimeSeconds: 5738 },
        segments: [
          { segmentKey: "total_time", type: "aggregate", percentile: 40, userSeconds: 5738, timeGapToMedianSeconds: 938 },
        ],
        penalties: [{ station: "run_5", penaltySeconds: 300 }],
      }),
      mockContext(),
      null,
    );
    assert.ok(htmlBody.includes("Treat this separately from running: it is execution leakage, not aerobic capacity."));
    assert.equal((htmlBody.match(/Adjusted race time without penalties:/g) ?? []).length, 1);
    assert.ok(!htmlBody.includes("Your adjusted race time was"));
    const calloutHtml = htmlBody.slice(htmlBody.indexOf("PENALTY ANALYSIS") - 500, htmlBody.indexOf("PENALTY ANALYSIS") + 1200);
    assert.ok(calloutHtml.includes("border-radius:8px"), "penalty analysis should render as a card");
    assert.ok(calloutHtml.includes("background-color:#1f1735"), "penalty card should use dark purple background");
  });

  it("material penalties on a station: PENALTY ANALYSIS names the station, not 'running'", () => {
    const penaltySection = { sectionKey: "penalty_callout", title: "Penalty Analysis", content: [] };
    const { htmlBody } = buildEmailReport(
      { sections: [penaltySection] },
      mockAnalysis({
        race: { finishTimeSeconds: 5738 },
        segments: [
          { segmentKey: "total_time", type: "aggregate", percentile: 40, userSeconds: 5738, timeGapToMedianSeconds: 938 },
          { segmentKey: "row", type: "station", label: "Row", percentile: 40, userSeconds: 310, timeGapToMedianSeconds: 20 },
        ],
        penalties: [{ segmentKey: "row", penaltySeconds: 120 }],
      }),
      mockContext(),
      null,
    );
    assert.match(htmlBody, /recorded on Row\. Treat this as station execution leakage, not a fitness limiter\./);
    assert.doesNotMatch(htmlBody, /Treat this separately from running: it is execution leakage, not aerobic capacity\./);
  });

  it("material penalties: main insight distinguishes fitness, penalties, and penalty-inflated Run 5", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_5", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Stations remain the largest target gap"));
    assert.ok(!htmlBody.includes("Stations remain the largest fitness limiter"));
    assert.ok(htmlBody.includes("penalties are your fastest controllable win"));
    assert.ok(htmlBody.includes("Run 5 is penalty-inflated"));
    assert.ok(!htmlBody.includes("Biggest opportunities: Run 5"));
  });

  it("material penalties: MAIN INSIGHT's fitness-opportunities sentence uses net-of-penalty gaps, not the penalized station", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] }, "analyse");
    // Wall Balls' raw gap would qualify, but its penalty-adjusted gap is well negative - it
    // must not be named here, matching the (already-fixed) other opportunity/priority panels.
    assert.match(htmlBody, /Biggest fitness opportunities: SkiErg and Sled Push\./);
    assert.doesNotMatch(htmlBody, /Biggest fitness opportunities:[^.]*Wall Balls/);
  });

  it("material penalties: method note explains penalty separation", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(
      htmlBody.includes("execution leakage") || htmlBody.includes("separated from running"),
      "method note should explain penalty separation",
    );
  });

  it("analyse-mode method note uses benchmark wording, not target wording", () => {
    const htmlBody = renderSplit({
      benchmarkContext: {
        primaryBenchmarkGroup: { label: "Open Men 30-39" },
      },
    }, "analyse");
    const methodHtml = htmlBody.slice(htmlBody.indexOf("METHOD NOTE"), htmlBody.indexOf("Performance Analytics for Hybrid Athletes"));
    assert.match(methodHtml, /Benchmarks are based on your selected benchmark band/);
    assert.match(methodHtml, /slower than the benchmark median/);
    assert.doesNotMatch(methodHtml, /slower than target/);
    assert.doesNotMatch(methodHtml, /Target times are based on your selected benchmark band/);
  });

  it("target-mode method note keeps target wording", () => {
    const htmlBody = renderSplit();
    const methodHtml = htmlBody.slice(htmlBody.indexOf("METHOD NOTE"), htmlBody.indexOf("Performance Analytics for Hybrid Athletes"));
    assert.match(methodHtml, /Target times are based on your selected target profile/);
    assert.match(methodHtml, /slower than target/);
    assert.doesNotMatch(methodHtml, /slower than the benchmark median/);
  });

  it("no penalties: method note does not mention penalty separation", () => {
    const htmlBody = renderSplit({ penalties: [] });
    assert.ok(!htmlBody.includes("execution leakage"), "method note should not mention penalties when none present");
  });

	  it("small penalties: keeps normal target snapshot and four-card summary", () => {
	    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 20 }] });
	    const stripHtml = htmlBody.slice(htmlBody.indexOf("YOUR RACE"), htmlBody.indexOf("PENALTIES") + 400);
	    assert.ok(stripHtml.includes("TARGET TIME"));
	    assert.ok(!stripHtml.includes("ADJUSTED"));
    assert.ok(!htmlBody.includes("Without penalties"));
    assert.ok(!htmlBody.includes("Net of penalties"));
  });

	  it("material penalties: full table uses execution label and no avoidable wording", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.ok(detailHtml.includes(">execution<"));
    assert.ok(!detailHtml.includes(">avoidable<"));
  });

  it("material penalties: training focus names the athlete's actual top opportunities, not a fixed station list", () => {
    const section = splitTableSection({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const { htmlBody } = buildEmailReport(
      { sections: [section, mockReport().sections.find((row) => row.sectionKey === "recommended_focus_areas")] },
      mockAnalysis({
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
    );
    // The headline title is also dynamic now - SkiErg (this fixture's biggest non-penalized
    // opportunity) drives it, not a fixed "sandbag durability" claim.
    assert.ok(htmlBody.includes("Clean execution first, then SkiErg efficiency."));
    assert.ok(!htmlBody.includes("Clean execution first, then sandbag durability."));
    assert.ok(htmlBody.includes("Reclaim penalty time through station standards"));
    // SkiErg (+140s gap) and Sled Push (+100s gap) are this fixture's biggest non-penalized
    // opportunities - Sandbag Lunges and Sled Pull are not, so they must not be named here.
    assert.ok(htmlBody.includes("SkiErg efficiency"));
    assert.ok(htmlBody.includes("Sled Push efficiency"));
    assert.ok(!htmlBody.includes("Sandbag lunge capacity under fatigue"));
    assert.ok(!htmlBody.includes("Sled pull efficiency and grip control"));
    // No muscleGroupProfile on this fixture, so the priority list falls back to a generic
    // (non-muscle-group-specific) item rather than naming any particular group.
    assert.ok(htmlBody.includes("Targeted strength endurance"));
    assert.ok(htmlBody.includes("Race-fatigued station practice"));
  });

  it("material penalties: training focus names the athlete's actual muscle-group limiter, not a hardcoded one", () => {
    const section = splitTableSection({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const { htmlBody } = buildEmailReport(
      { sections: [section, mockReport().sections.find((row) => row.sectionKey === "recommended_focus_areas")] },
      mockAnalysis({
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
        muscleGroupProfile: { primaryLimiters: ["grip_forearm"], primaryAssets: ["posterior_chain"] },
      }),
      mockContext(),
      null,
    );
    assert.ok(htmlBody.includes("Grip / forearm strength endurance"), "should name the athlete's real limiter");
    assert.ok(!htmlBody.includes("Posterior-chain strength endurance"), "must not name a group the data shows as a strength");
  });

  it("material penalties: training focus does not re-name the penalized segment as a separate opportunity", () => {
    const section = splitTableSection({ penalties: [{ station: "ski_erg", penaltySeconds: 300 }] });
    const { htmlBody } = buildEmailReport(
      { sections: [section, mockReport().sections.find((row) => row.sectionKey === "recommended_focus_areas")] },
      mockAnalysis({
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
    );
    const focusIdx = htmlBody.indexOf("NEXT TRAINING FOCUS");
    const focusSnippet = htmlBody.slice(focusIdx, focusIdx + 1200);
    assert.ok(!focusSnippet.includes("SkiErg efficiency"), "the penalized station already has its own penalty bullet");
    assert.ok(focusSnippet.includes("Sled Push efficiency"), "the next-biggest non-penalized opportunity should still appear");
  });

  it("material penalties: training volume stays factual while muscle signal acknowledges penalty-first context", () => {
    const section = splitTableSection({ penalties: [{ station: "run_5", penaltySeconds: 300 }] });
    const trainingVolume = {
      sectionKey: "training_volume",
      title: "Training Volume Assessment",
      content: ["Your reported running volume of approximately 30 km/week is well-matched.", "Strength frequency is sufficient."],
    };
    const muscleSection = {
      sectionKey: "muscle_group_profile",
      title: "Muscle Group Profile",
      content: [
        "Posterior chain and Grip / forearm are the common thread across your weakest stations; your Push / shoulder is a clear strength.",
        "Weakest stations: Sled Pull (20th percentile), Row (25th percentile)",
        "Strongest stations: Wall Balls (60th percentile)",
        "Training focus: Romanian deadlifts, hip thrusts, and Nordic curls build posterior-chain strength-endurance.",
      ],
    };
    const { htmlBody } = buildEmailReport(
      { sections: [section, trainingVolume, muscleSection] },
      mockAnalysis({
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
      null,
    );
    assert.ok(!htmlBody.includes("Run 5 loss is penalty-inflated"));
    assert.ok(!htmlBody.includes("do not treat the full raw running gap as a running-volume problem"));
    // The muscle section's own data-driven training-focus line should flow through as-is,
    // not get replaced by a fixed posterior-chain/sled-pulling sentence that may not match
    // this athlete's actual limiter.
    assert.ok(htmlBody.includes("Training focus: Romanian deadlifts, hip thrusts, and Nordic curls build posterior-chain strength-endurance."));
    assert.ok(!htmlBody.includes("Training focus: clean station standards first"));
  });

  it("still renders full detail when no goal group exists", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
    });
    assert.match(htmlBody, /FULL SPLIT DETAIL/);
  });

  it("keeps full detail email-safe", () => {
    const htmlBody = renderSplit({
      overrides: {
        run_1: {
          userSeconds: null,
          goalBenchmarkSeconds: 300,
          timeGapToMedianSeconds: null,
        },
        run_2: {
          confidence: "low",
        },
      },
    });
    assert.equal(htmlBody.includes('class="'), false);
    assert.match(htmlBody, /fonts\.googleapis\.com/);
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("shows Stations as unavailable when the aggregate station segment is absent", () => {
    const htmlBody = renderSplit({ omitSegmentKeys: ["work_time"] });
    const stationSnippet = htmlBody.slice(htmlBody.indexOf(">Stations<") - 300, htmlBody.indexOf(">Stations<") + 700);

    assert.match(stationSnippet, /Unavailable/);
    assert.doesNotMatch(stationSnippet, /On target|On benchmark|Main opportunity/);
  });

  it("renders low-confidence split detail rows with the existing approximate styling", () => {
    const htmlBody = renderSplit({
      overrides: {
        row: {
          confidence: "low",
          userSeconds: 420,
          goalBenchmarkSeconds: 300,
          timeGapToMedianSeconds: 120,
          frameGapSeconds: 120,
        },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const rowSnippet = detailHtml.slice(detailHtml.indexOf("Row") - 260, detailHtml.indexOf("Row") + 520);

    assert.match(rowSnippet, /~7:00/);
    assert.match(rowSnippet, /color:#94a3b8/);
  });

  it("still populates Comparison and Split status for a repaired (estimated) split, muted rather than dashed", () => {
    const htmlBody = renderSplit({
      overrides: {
        row: {
          confidence: "low",
          estimated: true,
          userSeconds: 420,
          benchmarkMedianSeconds: 368,
          goalBenchmarkSeconds: 300,
          timeGapToMedianSeconds: 120,
          frameGapSeconds: 120,
        },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const rowSnippet = detailHtml.slice(detailHtml.indexOf("Row") - 260, detailHtml.indexOf("Row") + 520);

    assert.match(rowSnippet, /&lt;7:00/);
    assert.match(rowSnippet, /5:00/);
    assert.match(rowSnippet, /Target opportunity/);
    assert.doesNotMatch(rowSnippet, /&ndash;<\/td><td[^>]*>&ndash;/);
  });

  it("uses a \"<\" upper-bound prefix (not \"~\") for a repaired split, plus an explanatory caveat below the table", () => {
    const htmlBody = renderSplit({
      overrides: {
        row: { confidence: "low", estimated: true, userSeconds: 420, timeGapToMedianSeconds: 120, frameGapSeconds: 120 },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const rowSnippet = detailHtml.slice(detailHtml.indexOf("Row") - 260, detailHtml.indexOf("Row") + 520);

    assert.match(rowSnippet, /&lt;7:00/);
    assert.doesNotMatch(rowSnippet, /~7:00/);
    assert.match(detailHtml, /missing from official results and estimated from your total race time/);
    assert.match(detailHtml, /your real split time is likely lower than shown/);
  });

  it("does not show the estimated-split caveat when no split is estimated", () => {
    const htmlBody = renderSplit();
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.doesNotMatch(detailHtml, /missing from official results and estimated from your total race time/);
  });

  it("dashes Comparison and Split status for a genuinely suppressed low-confidence split (not estimated)", () => {
    const htmlBody = renderSplit({
      overrides: {
        row: {
          confidence: "low",
          suppressed: true,
          userSeconds: 420,
          goalBenchmarkSeconds: 300,
          timeGapToMedianSeconds: 120,
          frameGapSeconds: 120,
        },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    const rowSnippet = detailHtml.slice(detailHtml.indexOf("Row") - 260, detailHtml.indexOf("Row") + 520);

    assert.match(rowSnippet, /~7:00/);
    assert.match(rowSnippet, /&ndash;<\/td><td[^>]*>&ndash;/);
  });

  it("renders segment profile and remains email-safe", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /SEGMENT PROFILE/);
    assert.equal(htmlBody.includes('class="'), false);
    assert.match(htmlBody, /fonts\.googleapis\.com/);
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("split table includes Comparison and Split status column headers", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysisWithSplits = {
      ...mockAnalysis(),
      segments: [
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 300, benchmarkMedianSeconds: 280, timeGapToMedianSeconds: 20, percentile: 55, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 500, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 200, percentile: 8, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5612, benchmarkMedianSeconds: 5200, timeGapToMedianSeconds: 412, confidence: "high" },
      ],
      benchmarkContext: { primaryBenchmarkGroup: { label: "benchmark group" } },
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Comparison"), `expected "Comparison" header, not found in HTML`);
    assert.ok(htmlBody.includes("Split status"), `expected "Split status" header, not found in HTML`);
    assert.ok(!htmlBody.includes("Band standing"), "split table should not use split percentile standing");
    assert.ok(!htmlBody.includes("Band score"), "split table should not use split percentile score");
  });

  it("split table renders split status from seconds gap, not percentile", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysisWithSplits = {
      ...mockAnalysis(),
      segments: [
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 300, benchmarkMedianSeconds: 280, timeGapToMedianSeconds: 20, percentile: 55, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 500, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 200, percentile: 8, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5612, benchmarkMedianSeconds: 5200, timeGapToMedianSeconds: 412, confidence: "high" },
      ],
      benchmarkContext: { primaryBenchmarkGroup: { label: "benchmark group" } },
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Priority"), "expected Priority split status text in split table HTML");
  });

  it("split table renders ahead-of-benchmark gaps as Strength, not top-percent shorthand", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysisWithSplits = {
      ...mockAnalysis(),
      segments: [
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 260, benchmarkMedianSeconds: 280, timeGapToMedianSeconds: -20, percentile: 20, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 500, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 200, percentile: 8, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5612, benchmarkMedianSeconds: 5200, timeGapToMedianSeconds: 412, confidence: "high" },
      ],
      benchmarkContext: { primaryBenchmarkGroup: { label: "benchmark group" } },
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Strength"), "expected ahead-of-benchmark gap to render as Strength split status");
    assert.ok(!htmlBody.includes("Top 20%"), "split table should not mix in top-percent shorthand");
  });

  it("full split table renders RUN inline pills", () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.includes(">RUN<"), "split table should contain RUN pill");
  });

  it("full split table renders STN inline pills", () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.includes(">STN<"), "split table should contain STN pill");
  });

  it('target mode full split table uses "Gap vs target" column header', () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.includes("Gap vs target"), 'expected "Gap vs target" column header');
    assert.ok(!htmlBody.includes("Gap vs median"), 'target mode should not show "Gap vs median" column header');
    assert.ok(!htmlBody.includes("+/−"), 'should not contain old "+/−" header');
  });

  it('analyse mode split table keeps "Gap vs median" column header instead of "+/-"', () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
    }, "analyse");
    assert.ok(htmlBody.includes("Gap vs median"), 'expected "Gap vs median" column header');
    assert.ok(!htmlBody.includes("+/−"), 'should not contain old "+/−" header');
  });

  it("target mode empty strengths fallback references target profile, not benchmark", () => {
    const htmlBody = renderSplit({
      overrides: {
        sled_pull: { timeGapToExactTargetSeconds: 20, frameGapSeconds: 20 },
      },
    }, "target");
    const strengthsHtml = htmlBody.slice(htmlBody.indexOf("Strengths to protect"), htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.match(strengthsHtml, /No segments clearly ahead of target profile/i);
    assert.doesNotMatch(strengthsHtml, /ahead of benchmark/i);
  });

  it("analyse mode empty strengths fallback keeps benchmark wording", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
      overrides: {
        sled_pull: { timeGapToMedianSeconds: 20, frameGapSeconds: 20 },
      },
    }, "analyse");
    const strengthsHtml = htmlBody.slice(htmlBody.indexOf("Strengths to protect"), htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.match(strengthsHtml, /No segments clearly ahead of benchmark/i);
  });

  it("target mode anomalous-gap warning references target profile, not benchmark", () => {
    const htmlBody = renderSplit({
      overrides: {
        wall_balls: {
          userSeconds: 130,
          timeGapToExactTargetSeconds: 100,
          frameGapSeconds: 100,
        },
      },
    }, "target");
    const opportunitiesHtml = htmlBody.slice(htmlBody.indexOf("Biggest opportunities"), htmlBody.indexOf("Strengths to protect"));
    assert.match(opportunitiesHtml, /unusually large gap vs the target profile/i);
    assert.doesNotMatch(opportunitiesHtml, /gap vs the benchmark/i);
  });

  it("analyse mode anomalous-gap warning keeps benchmark wording", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
      overrides: {
        wall_balls: {
          userSeconds: 130,
          timeGapToMedianSeconds: 100,
          frameGapSeconds: 100,
        },
      },
    }, "analyse");
    const opportunitiesHtml = htmlBody.slice(htmlBody.indexOf("Biggest opportunities"), htmlBody.indexOf("Strengths to protect"));
    assert.match(opportunitiesHtml, /unusually large gap vs the benchmark/i);
  });

  it("split table does not add up-arrow indicators in the gap column", () => {
    const htmlBody = renderSplit();
    assert.ok(!htmlBody.includes("&#9650;"), "gap column should rely on colour and row background only");
  });

  it("renders MAIN INSIGHT race story summary", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("MAIN INSIGHT"));
  });

  it("MAIN INSIGHT names running when the small running gap is larger than stations", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
      overrides: {
        run_time: { frameGapSeconds: undefined, timeGapToMedianSeconds: 50 },
        work_time: { frameGapSeconds: undefined, timeGapToMedianSeconds: 22 },
        total_time: { frameGapSeconds: undefined, timeGapToMedianSeconds: 72 },
      },
    }, "analyse");
    const insightHtml = htmlBody.slice(htmlBody.indexOf("MAIN INSIGHT"), htmlBody.indexOf("SEGMENT PROFILE"));
    assert.match(insightHtml, /Running is the largest contributor/i);
    assert.doesNotMatch(insightHtml, /Stations are the largest contributor at[^.]*0:22/i);
  });

  it("renders all four summary card labels", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    for (const label of ["Race time", "Stations", "Running", "RoxZone"]) {
      assert.ok(htmlBody.includes(label), `expected summary card label ${label}`);
    }
  });

  it("race time summary card note reads vs benchmark median when no goal group", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("vs benchmark median"), "should show median label when no goal group");
    assert.ok(!htmlBody.includes("Overall improvement required"));
  });

  it("renders opportunity and strength panels", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Biggest opportunities"));
    assert.ok(htmlBody.includes("Strengths to protect"));
  });

  it("exceptional RoxZone gap appears in the strengths panel", () => {
    const htmlBody = renderRoxZoneGap(-60);
    const strengthsIdx = htmlBody.indexOf("Strengths to protect");
    assert.ok(strengthsIdx > -1, "Strengths to protect panel should exist");
    const snippet = htmlBody.slice(strengthsIdx, htmlBody.indexOf("</table>", strengthsIdx));
    assert.ok(snippet.includes("RoxZone"), "RoxZone should appear in the strengths panel when gap is -60s");
  });

  it("near-zero RoxZone gap does not appear in the strengths panel", () => {
    const htmlBody = renderRoxZoneGap(-10);
    const strengthsIdx = htmlBody.indexOf("Strengths to protect");
    assert.ok(strengthsIdx > -1, "Strengths to protect panel should exist");
    const snippet = htmlBody.slice(strengthsIdx, htmlBody.indexOf("</table>", strengthsIdx));
    assert.ok(!snippet.includes("RoxZone"), "RoxZone with -10s gap should not appear in the strengths panel");
  });

  it("roxNote affirms exceptional RoxZone rather than understating it", () => {
    const htmlBody = renderRoxZoneGap(-60);
    assert.ok(htmlBody.includes("clear strength"), "email should say clear strength for exceptional RoxZone");
    assert.ok(!htmlBody.includes("not a meaningful drag"), "should not use dismissive framing when RoxZone is exceptional");
  });

  it("execNote text is never rendered", () => {
    const htmlBody = renderSplit();
    assert.ok(!htmlBody.includes("execution, not engine fitness"), "execNote should be deleted and never appear in email output");
  });

  it('RoxZone summary card shows "Strength" for exceptional gap', () => {
    const htmlBody = renderRoxZoneGap(-60);
    assert.ok(htmlBody.includes("Strength"), 'RoxZone card note should say "Strength"');
    assert.ok(!htmlBody.includes("On benchmark"), 'should not say "On benchmark" for an exceptional RoxZone');
  });

  it("full split detail omits Type, Band, and Target column headers", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    const detailHtml = htmlBody.slice(htmlBody.indexOf("FULL SPLIT DETAIL"));
    assert.ok(!detailHtml.includes(">Type<"));
    assert.ok(!detailHtml.includes(">Band<"));
    assert.ok(!detailHtml.includes(">Target *<"));
  });

  it("full split table renders RUN and STN inline pills", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes(">RUN<"));
    assert.ok(htmlBody.includes(">STN<"));
  });

  it("does not render totals block in compact email", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(!htmlBody.includes("TOTALS"));
    assert.ok(!htmlBody.includes("Total Race Time"));
  });

  it("does not render how-to-read block in compact email", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(!htmlBody.includes("HOW TO READ THIS"));
  });

  it("segment column contains the refreshed inline 9px type tag", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("font-size:9px;font-weight:700;padding:1px 5px"));
  });

  it("snapshot strip final column has no right border when no penalties present", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({ penalties: [] }), {}, null);
    assert.ok(!htmlBody.match(/OVERALL STANDING[\s\S]{0,200}border-right:1px solid/),
      "OVERALL STANDING cell should not have right border when no penalties");
  });

  it("gap column has at least 12px right padding", () => {
    const htmlBody = renderSplit();
    assert.ok(
      htmlBody.includes("padding-right:12px") || htmlBody.includes("padding:7px 12px"),
      "gap column should have at least 12px right padding",
    );
  });

  it('race time summary card note reads "vs benchmark median" when no goal group', () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("vs benchmark median"), 'race time card should show "vs benchmark median" when no goal group');
    assert.ok(!htmlBody.includes("Overall improvement required"), "old verbose note should not appear");
  });

  it("secondary CTA link uses muted text style not a button", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ carouselUrl: "https://example.com/carousel" }),
      {},
      null,
    );
    assert.ok(htmlBody.includes("View your shareable carousel"), "secondary CTA link text should appear");
    const snippet = htmlBody.slice(htmlBody.indexOf("View your shareable carousel") - 240, htmlBody.indexOf("View your shareable carousel") + 80);
    assert.ok(snippet.includes("color:#22d3ee"), "secondary CTA link should use refreshed accent color");
    assert.ok(!snippet.includes("background-color:#08a7f5"), "secondary CTA link should not be styled as a button");
  });

  it("section eyebrow labels use consistent letter-spacing", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection, { sectionKey: "training_volume", title: "Training Volume Assessment", content: ["Run more.", "Lift twice."] }] },
      analysisWithFullSplits,
      {},
      null,
    );
    const count = (htmlBody.match(/letter-spacing:0\.09em/g) ?? []).length;
    assert.ok(count >= 3, `expected at least 3 eyebrow labels with canonical letter-spacing, found ${count}`);
  });
});

describe("renderBenchmarkLensCard (analyse mode)", () => {
  it("renders BENCHMARK LENS heading with data-section attribute", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ benchmarkContext: { achievedBand: "sub_100" } }),
      mockContext(),
      null,
      "analyse",
    );
    assert.ok(htmlBody.includes("BENCHMARK LENS"));
    assert.ok(htmlBody.includes('data-section="benchmark-lens"'));
  });

  it("renders finish time, comparison group label, and within-band percentile", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_100", confidenceLabel: "strong" },
        race: { finishTimeSeconds: 5738 },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 38, fieldPercentile: 99 }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.ok(htmlBody.includes("1:35:38"), "should show finish time");
    assert.ok(htmlBody.includes("95:00"), "should show comparison group range");
    assert.ok(htmlBody.includes("99:59"), "should show comparison group range end");
    assert.ok(htmlBody.includes("38th percentile"), "should show within-band percentile");
    assert.ok(htmlBody.includes("within this band"), "should qualify percentile scope");
  });

  it("labels historical benchmark-band groups as cumulative under-threshold populations", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          analysisFrame: ANALYSIS_FRAMES.COMPETITIVE,
          achievedBand: "sub_85",
          confidenceLabel: "strong",
          primaryBenchmarkGroup: {
            label: "Open Male",
            sampleSize: 13587,
            datasetVersion: "historical_hyrox_2026_06_v1",
            performanceBand: "sub_85",
          },
        },
        race: { finishTimeSeconds: 4980 },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 42 }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    const lens = benchmarkLensSection(htmlBody);
    const comparisonRow = comparisonGroupRow(lens);

    assert.match(comparisonRow, /Under 85:00 finishers/);
    assert.doesNotMatch(comparisonRow, /80:00/);
    assert.doesNotMatch(comparisonRow, /84:59/);
    assert.match(htmlBody, /Compared against 13,587 Under 85:00 finishers/);
  });

  it("uses high-in-band copy when within-band percentile is 80 or above", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_100" },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 93, fieldPercentile: 93 }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.ok(htmlBody.includes("high within this band"));
    assert.ok(htmlBody.includes("band ahead"));
  });

  it("does not claim a 'band ahead' for a high-in-band sub-60 athlete, since sub-60 is the fastest band", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_60", analysisFrame: { frame: "sub60_internal", comparisonBand: "sub_60", stretchBand: null, gapToBandMedianSeconds: -90 } },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 93, fieldPercentile: 93 }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.ok(htmlBody.includes("high within the sub-60 band"));
    assert.ok(htmlBody.includes("no faster band to compare against"));
    assert.ok(!htmlBody.includes("The next useful comparison is the band ahead"));
  });

  it("omits Your standing row when percentile is absent or non-finite", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: { achievedBand: "sub_95" },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: Number.NaN }],
      }),
      mockContext(),
      null,
      "analyse",
    );
    assert.ok(!htmlBody.includes("within this band"), "should omit percentile row");
  });

  it("returns empty string when finish band is unknown or finish time is missing", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ benchmarkContext: {}, race: { finishTimeSeconds: Number.NaN } }),
      mockContext({ finishTimeSeconds: Number.NaN }),
      null,
      "analyse",
    );
    assert.ok(!htmlBody.includes("BENCHMARK LENS"));
  });

  it("explains band escalation and shows the next-band comparison group for a next_band frame (no explicit useNextBandGaps flag)", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_90",
          nextBand: "sub_85",
          analysisFrame: { frame: "next_band", comparisonBand: "sub_85", stretchBand: null, gapToBandMedianSeconds: -80 },
          primaryBenchmarkGroup: { label: "Doubles Female", sampleSize: 4200 },
          nextBandGroup: { label: "Doubles Female", sampleSize: 10725 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, fieldPercentile: 52 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.ok(
      htmlBody.includes(
        "The standing above ranks you within the sub-90 band. Because you've already beaten that band's median, the station and run gaps further down are measured against the sub-85 band instead — that's the next benchmark worth chasing.",
      ),
      "should render the band-escalation explanation sentence",
    );
    assert.ok(htmlBody.includes("80:00"), "Comparison group should show the escalated sub-85 range, not the athlete's own sub-90 range");
    assert.ok(htmlBody.includes("84:59"), "Comparison group should show the escalated sub-85 range end");
    assert.ok(htmlBody.includes("10,725"), "hero 'Compared against' sample size should come from the escalated band's group");
  });

  it("explains penalty-adjusted two-step band escalation while preserving official achieved-band standing copy", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_90",
          escalationBasisBand: "sub_85",
          nextBand: "sub_80",
          analysisFrame: { frame: "next_band", comparisonBand: "sub_80", stretchBand: null, gapToBandMedianSeconds: -90 },
          primaryBenchmarkGroup: { label: "Open Male", sampleSize: 4200 },
          escalationBasisBandGroup: { label: "Open Male", sampleSize: 7200 },
          nextBandGroup: { label: "Open Male", sampleSize: 10725 },
        },
        race: { finishTimeSeconds: 87 * 60 },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, fieldPercentile: 52 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    const lens = benchmarkLensSection(htmlBody);
    assert.ok(lens.includes("The standing above ranks you within the sub-90 band"));
    assert.ok(lens.includes("Because your penalty-adjusted time already beats the sub-85 median"));
    assert.ok(lens.includes("gaps below are measured against the sub-80 band instead - that's the level your execution is really at."));
    assert.ok(comparisonGroupRow(lens).includes("75:00"), "comparison group should use the final comparison band range");
    assert.ok(comparisonGroupRow(lens).includes("79:59"), "comparison group should use the final comparison band range end");
    assert.equal(lens.includes("that's the next benchmark worth chasing"), false);
  });

  it("explains penalty-adjusted reclassification for a catch_up frame without showing the raw-band comparison group", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_80",
          escalationBasisBand: "sub_75",
          nextBand: "sub_70",
          analysisFrame: { frame: "catch_up", comparisonBand: "sub_75", stretchBand: null, gapToBandMedianSeconds: 65 },
          primaryBenchmarkGroup: { label: "Open Female", sampleSize: 4200 },
          escalationBasisBandGroup: { label: "Open Female", sampleSize: 7200 },
          nextBandGroup: { label: "Open Female", sampleSize: 10725 },
        },
        race: { finishTimeSeconds: 77 * 60 },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 64, fieldPercentile: 52 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    const lens = benchmarkLensSection(htmlBody);
    const row = comparisonGroupRow(lens);
    assert.ok(row.includes("70:00"), "comparison group should use the penalty-adjusted sub-75 range start");
    assert.ok(row.includes("74:59"), "comparison group should use the penalty-adjusted sub-75 range end");
    assert.equal(row.includes("75:00"), false, "comparison group should not use the official raw sub-80 range start");
    assert.equal(row.includes("79:59"), false, "comparison group should not use the official raw sub-80 range end");
    assert.ok(lens.includes("The standing above ranks you within the sub-80 band"));
    assert.ok(lens.includes("Because your penalty-adjusted time falls in the sub-75 band"));
    assert.ok(lens.includes("gaps below are measured against that band instead of your official sub-80 classification."));
    assert.equal(lens.includes("Your percentiles compare you with athletes at a similar race level"), false);
    assert.equal(lens.includes("Because you've already beaten that band's median"), false);
    assert.equal(lens.includes("penalty-adjusted time already beats"), false);
  });

  it("uses the penalty-adjusted comparison band stats for Benchmark Lens standing when reclassified", () => {
    const rawBandKey = "hyrox:test_lens:band:sub_80:open:female";
    const comparisonBandKey = "hyrox:test_lens:band:sub_75:open:female";
    const rawBandStats = { groupKey: rawBandKey, metricKey: "total_time", sampleSize: 400, p10Seconds: 4500, p25Seconds: 4620, p50Seconds: 4680, p75Seconds: 4740, p90Seconds: 4800 };
    const comparisonBandStats = { groupKey: comparisonBandKey, metricKey: "total_time", sampleSize: 400, p10Seconds: 4200, p25Seconds: 4300, p50Seconds: 4380, p75Seconds: 4450, p90Seconds: 4520 };
    const rawPercentile = approximatePercentile(4627, rawBandStats);
    const comparisonPercentile = approximatePercentile(4447, comparisonBandStats);

    try {
      setBenchmarkData({
        groups: [
          { groupKey: rawBandKey, datasetVersion: "test_lens", division: "open", gender: "female", performanceBand: "sub_80", sampleSize: 400 },
          { groupKey: comparisonBandKey, datasetVersion: "test_lens", division: "open", gender: "female", performanceBand: "sub_75", sampleSize: 400 },
        ],
        metrics: [rawBandStats, comparisonBandStats],
      });

      const { htmlBody } = buildEmailReport(
        mockReport(),
        mockAnalysis({
          benchmarkContext: {
            achievedBand: "sub_80",
            escalationBasisBand: "sub_75",
            nextBand: "sub_70",
            analysisFrame: { frame: "catch_up", comparisonBand: "sub_75", stretchBand: null, gapToBandMedianSeconds: 65 },
            primaryBenchmarkGroup: { key: rawBandKey, label: "Open Female", sampleSize: 400 },
            escalationBasisBandGroup: { key: comparisonBandKey, label: "Open Female", sampleSize: 400 },
            nextBandGroup: { label: "Open Female", sampleSize: 300 },
          },
          race: { finishTimeSeconds: 4627 },
          segments: [{
            segmentKey: "total_time",
            type: "aggregate",
            percentile: rawPercentile,
            fieldPercentile: 52,
            userSeconds: 4627,
            userSecondsNetOfPenalty: 4447,
          }],
        }),
        mockContext(),
        null,
        "analyse",
      );

      const lens = benchmarkLensSection(htmlBody);
      assert.ok(lens.includes(`${formatPercentileRank(comparisonPercentile)} within this band`));
      assert.equal(lens.includes(`${formatPercentileRank(rawPercentile)} within this band`), false);
      assert.ok(comparisonGroupRow(lens).includes("70:00"));
      assert.ok(comparisonGroupRow(lens).includes("74:59"));
    } finally {
      setBenchmarkData({ groups: [], metrics: [] });
    }
  });

  it("uses aggregate total_time net-of-penalty seconds for a reclassified Benchmark Lens standing", () => {
    const rawBandKey = "hyrox:test_kate_lens:band:sub_80:open:female";
    const comparisonBandKey = "hyrox:test_kate_lens:band:sub_75:open:female";
    const comparisonBandStats = {
      groupKey: comparisonBandKey,
      metricKey: "total_time",
      sampleSize: 400,
      p75Seconds: 4304,
      medianSeconds: 4382,
      p50Seconds: 4382,
      p90Seconds: 4447,
      p99Seconds: 4497,
    };
    const adjustedPercentile = approximatePercentile(4447, comparisonBandStats);
    const rawPercentile = approximatePercentile(4627, comparisonBandStats);

    try {
      setBenchmarkData({
        groups: [
          { groupKey: rawBandKey, datasetVersion: "test_kate_lens", division: "open", gender: "female", performanceBand: "sub_80", sampleSize: 400 },
          { groupKey: comparisonBandKey, datasetVersion: "test_kate_lens", division: "open", gender: "female", performanceBand: "sub_75", sampleSize: 400 },
        ],
        metrics: [comparisonBandStats],
      });

      const { htmlBody } = buildEmailReport(
        mockReport(),
        mockAnalysis({
          benchmarkContext: {
            achievedBand: "sub_80",
            escalationBasisBand: "sub_75",
            nextBand: "sub_70",
            analysisFrame: { frame: "catch_up", comparisonBand: "sub_75", stretchBand: null, gapToBandMedianSeconds: 65 },
            primaryBenchmarkGroup: { key: rawBandKey, label: "Open Female", sampleSize: 400 },
            escalationBasisBandGroup: { key: comparisonBandKey, label: "Open Female", sampleSize: 400 },
            nextBandGroup: { label: "Open Female", sampleSize: 300 },
          },
          race: { finishTimeSeconds: 4627 },
          penalties: [{ runKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
          segments: [{
            segmentKey: "total_time",
            type: "aggregate",
            percentile: rawPercentile,
            fieldPercentile: 52,
            userSeconds: 4627,
            userSecondsNetOfPenalty: 4447,
            timeGapToMedianSeconds: 245,
            timeGapToMedianSecondsNetOfPenalty: 65,
          }],
        }),
        mockContext(),
        null,
        "analyse",
      );

      const lens = benchmarkLensSection(htmlBody);
      assert.ok(lens.includes(`${formatPercentileRank(adjustedPercentile)} within this band`));
      assert.equal(lens.includes(`${formatPercentileRank(rawPercentile)} within this band`), false);
      assert.ok(comparisonGroupRow(lens).includes("70:00"));
      assert.ok(comparisonGroupRow(lens).includes("74:59"));
    } finally {
      setBenchmarkData({ groups: [], metrics: [] });
    }
  });

  it("keeps Benchmark Lens standing unchanged when the comparison band is not escalated", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_80",
          escalationBasisBand: "sub_80",
          analysisFrame: { frame: "current_band", comparisonBand: "sub_80", stretchBand: null, gapToBandMedianSeconds: 120 },
          primaryBenchmarkGroup: { label: "Open Female", sampleSize: 4200 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 64, userSeconds: 4627, userSecondsNetOfPenalty: 4447 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    const lens = benchmarkLensSection(htmlBody);
    assert.ok(lens.includes("64th percentile within this band"));
  });

  it("keeps the ordinary single-step escalation sentence when escalation is not penalty-adjusted", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          achievedBand: "sub_90",
          escalationBasisBand: "sub_90",
          nextBand: "sub_85",
          analysisFrame: { frame: "next_band", comparisonBand: "sub_85", stretchBand: null, gapToBandMedianSeconds: -80 },
          primaryBenchmarkGroup: { label: "Open Male", sampleSize: 4200 },
          nextBandGroup: { label: "Open Male", sampleSize: 10725 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, fieldPercentile: 52 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    const lens = benchmarkLensSection(htmlBody);
    assert.ok(lens.includes("Because you've already beaten that band's median"));
    assert.ok(lens.includes("that's the next benchmark worth chasing"));
    assert.equal(lens.includes("penalty-adjusted time already beats"), false);
  });

  it("doubles method note scopes sample size to the resolved comparison group", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: true,
          doublesBenchmarkedAsSingles: false,
          achievedBand: "sub_90",
          nextBand: "sub_85",
          analysisFrame: { frame: "next_band", comparisonBand: "sub_85", stretchBand: null, gapToBandMedianSeconds: -80 },
          primaryBenchmarkGroup: { label: "Doubles Female", sampleSize: 4200 },
          nextBandGroup: { label: "Doubles Female", sampleSize: 10725 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, fieldPercentile: 52 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.match(htmlBody, /Compared against 10,725 80:00.84:59 finishers/);
    assert.match(htmlBody, /this comparison group includes 10,725 teams, not singles data/i);
    assert.doesNotMatch(htmlBody, /dedicated doubles dataset \(10,725 teams\)/i);
    assert.doesNotMatch(htmlBody, /this comparison group includes 4,200 teams/i);
  });

  it("doubles method note uses the goal benchmark group sample size in target mode", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: true,
          doublesBenchmarkedAsSingles: false,
          achievedBand: "sub_95",
          primaryBenchmarkGroup: { label: "Doubles Male 95:00-99:59", sampleSize: 10419 },
          goalBenchmarkGroup: { label: "Doubles Male 90:00-94:59", sampleSize: 12504, targetFinishSeconds: 5400 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, userSeconds: 5700, goalBenchmarkSeconds: 5400 }],
      }),
      mockContext(),
      null,
      "target",
    );

    assert.match(htmlBody, /Target times are based on your selected target profile/i);
    assert.match(htmlBody, /this comparison group includes 12,504 teams, not singles data/i);
    assert.doesNotMatch(htmlBody, /this comparison group includes 10,419 teams/i);
  });

  it("doubles method note keeps the resolved benchmark comparison group in analyse mode", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({
        benchmarkContext: {
          useDoublesBenchmarks: true,
          doublesBenchmarkedAsSingles: false,
          achievedBand: "sub_95",
          primaryBenchmarkGroup: { label: "Doubles Male 95:00-99:59", sampleSize: 10419 },
          goalBenchmarkGroup: { label: "Doubles Male 90:00-94:59", sampleSize: 12504, targetFinishSeconds: 5400 },
        },
        segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 73, userSeconds: 5700, benchmarkMedianSeconds: 5600 }],
      }),
      mockContext(),
      null,
      "analyse",
    );

    assert.match(htmlBody, /Benchmarks are based on your selected benchmark band/i);
    assert.match(htmlBody, /this comparison group includes 10,419 teams, not singles data/i);
    assert.doesNotMatch(htmlBody, /this comparison group includes 12,504 teams/i);
  });

  for (const frame of Object.values(ANALYSIS_FRAMES)) {
    for (const useNextBandGaps of [true, false, undefined]) {
      const flagLabel = useNextBandGaps === undefined ? "undefined" : String(useNextBandGaps);
      it(`uses analysisFrame comparisonBand for frame=${frame}, useNextBandGaps=${flagLabel}`, () => {
        const analysisFrame = {
          frame,
          comparisonBand: "sub_85",
          stretchBand: "sub_80",
          gapToBandMedianSeconds: -30,
        };
        if (useNextBandGaps !== undefined) analysisFrame.useNextBandGaps = useNextBandGaps;

        const { htmlBody } = buildEmailReport(
          mockReport(),
          mockAnalysis({
            benchmarkContext: {
              achievedBand: "sub_90",
              nextBand: "sub_85",
              analysisFrame,
              primaryBenchmarkGroup: { label: "Open Male", sampleSize: 9000 },
              nextBandGroup: { label: "Open Male", sampleSize: 6000 },
            },
            segments: [{ segmentKey: "total_time", type: "aggregate", percentile: 70, fieldPercentile: 80 }],
          }),
          mockContext(),
          null,
          "analyse",
        );
        const lens = benchmarkLensSection(htmlBody);
        assert.ok(lens.includes("BENCHMARK LENS"), "sanity check: Benchmark Lens section rendered");
        assert.equal(
          lens.includes("that's the next benchmark worth chasing"),
          true,
          "escalation explanation should follow analysisFrame.comparisonBand when it differs from achievedBand",
        );

        const row = comparisonGroupRow(lens);
        assert.ok(row.includes("80:00"), "comparison group should use comparisonBand range start");
        assert.ok(row.includes("84:59"), "comparison group should use comparisonBand range end");
        assert.equal(row.includes("85:00"), false, "comparison group should not use achievedBand range start");
        assert.equal(row.includes("89:59"), false, "comparison group should not use achievedBand range end");
      });
    }
  }
});

describe("renderTargetLensCard (target mode)", () => {
  it("renders TARGET LENS heading with data-section attribute in target mode", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ race: { finishTimeSeconds: 5738 } }),
      mockContext({ targetFinishTimeSeconds: 4800 }),
      null,
      "target",
    );
    assert.ok(htmlBody.includes("TARGET LENS"));
    assert.ok(htmlBody.includes('data-section="target-lens"'));
  });

  it("renders current and target finish times with their band labels", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ race: { finishTimeSeconds: 5738 } }),
      mockContext({ targetFinishTimeSeconds: 4800 }),
      null,
      "target",
    );
    assert.ok(htmlBody.includes("1:35:38"), "should show current finish time");
    assert.ok(htmlBody.includes("1:20:00"), "should show target finish time");
    assert.match(htmlBody, /95\S*100/, "should show current band label");
    assert.match(htmlBody, /80\S*85/, "should show target band label");
  });

  it("shows N-bands-ahead explanation when target is in a faster band", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ race: { finishTimeSeconds: 5738 } }),
      mockContext({ targetFinishTimeSeconds: 4800 }),
      null,
      "target",
    );
    assert.ok(/3 bands ahead/.test(htmlBody));
  });

  it("shows same-band refinement copy when target is in the same band as current", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ race: { finishTimeSeconds: 5738 } }),
      mockContext({ targetFinishTimeSeconds: 5800 }),
      null,
      "target",
    );
    assert.ok(htmlBody.includes("refinement"));
  });

  it("shows already-ahead copy when athlete is faster than their target", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ race: { finishTimeSeconds: 4500 } }),
      mockContext({ targetFinishTimeSeconds: 5612 }),
      null,
      "target",
    );
    assert.ok(htmlBody.includes("already") && htmlBody.includes("ahead"));
  });

  it("falls back to BENCHMARK LENS when no target time is present in target mode", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ benchmarkContext: { achievedBand: "sub_95" } }),
      mockContext({ targetFinishTimeSeconds: null }),
      null,
      "target",
    );
    assert.ok(htmlBody.includes("BENCHMARK LENS"), "should fall back to benchmark lens");
    assert.ok(!htmlBody.includes("TARGET LENS"), "should not show target lens");
  });
});

describe("content accuracy fixes (feature-143)", () => {
  const splitSection = { sectionKey: "race_split_breakdown", title: "Race Split Breakdown", tableData: {} };

  function extractSection(html, startMarker, endMarker) {
    // Use lastIndexOf so we get the panel header, not an earlier prose mention of the same phrase.
    const start = html.lastIndexOf(startMarker);
    const end = html.indexOf(endMarker, start);
    if (start === -1 || end === -1 || end <= start) return "";
    return html.slice(start, end);
  }

  it("B-1: reports station performance as already ahead when station gap is negative in analyse mode", () => {
    const analysis = mockAnalysis({
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 55, frameGapSeconds: 60, userSeconds: 5400 },
        { segmentKey: "work_time", type: "aggregate", frameGapSeconds: -60, userSeconds: 2100 },
        { segmentKey: "run_time", type: "aggregate", frameGapSeconds: 180, userSeconds: 2400 },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.match(htmlBody, /station.*ahead|ahead.*station|already ahead/i);
  });

  it("B-3: segments with null or missing label are excluded from Biggest Opportunities", () => {
    const analysis = mockAnalysis({
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 50 },
        { segmentKey: "wall_balls", type: "station", label: null, percentile: 20, frameGapSeconds: 90 },
        { segmentKey: "row", type: "station", label: "Row", percentile: 22, frameGapSeconds: 80 },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const section = extractSection(htmlBody, "Biggest opportunities", "Strengths to protect");
    assert.ok(section.includes("Row"), "Row should appear in Biggest Opportunities");
    assert.ok(!section.includes(">null<"), "null label should never render as text");
  });

  it("L-10: near-benchmark seconds gaps are excluded from Biggest Opportunities in analyse mode", () => {
    const analysis = mockAnalysis({
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 50 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 5, frameGapSeconds: 20, userSeconds: 420, benchmarkMedianSeconds: 400 },
        { segmentKey: "row", type: "station", label: "Row", percentile: 90, frameGapSeconds: 90, userSeconds: 390, benchmarkMedianSeconds: 300 },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const section = extractSection(htmlBody, "Biggest opportunities", "Strengths to protect");
    assert.ok(section.includes("Row"), "Row should appear because its seconds gap is material");
    assert.ok(!section.includes("Wall Balls"), "Wall Balls should be excluded because its seconds gap is near benchmark");
  });

  it("L-10: percentile filter does not apply in target mode — on-benchmark segments still appear", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 50, goalBenchmarkSeconds: 3600, userSeconds: 3900 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", percentile: 45, frameGapSeconds: 60, userSeconds: 480, goalBenchmarkSeconds: 360 },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    const section = extractSection(htmlBody, "Biggest opportunities", "Strengths to protect");
    assert.ok(section.includes("Wall Balls"), "Wall Balls should appear in target mode regardless of percentile");
  });

  it("Biggest opportunities names a dominant RoxZone gap even when every individual split is small", () => {
    // Mirrors a real tight elite-race profile: station/run gaps are all under 20s, but RoxZone
    // (+50s) is the standout loss. RoxZone must be a candidate for this list, not excluded
    // purely because it's an aggregate segment outside SPLIT_TABLE_RACE_ORDER.
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_60" },
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 91, userSeconds: 3363 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "Total Roxzone Time", frameGapSeconds: 50, userSeconds: 296, percentile: 20 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 19, userSeconds: 250, percentile: 60 },
        { segmentKey: "burpee_broad_jump", type: "station", label: "Burpee Broad Jump", frameGapSeconds: 16, userSeconds: 196, percentile: 65 },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const section = extractSection(htmlBody, "Biggest opportunities", "Strengths to protect");
    assert.ok(section.includes("RoxZone"), "RoxZone should appear in Biggest Opportunities");
    assert.ok(!section.includes("No significant time losses detected"), "a genuine 50s RoxZone gap should not be reported as no significant loss");
  });

  it("M-9: shows anomaly warning when a single station gap is more than 2.5x the implied benchmark time", () => {
    const analysis = mockAnalysis({
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 20 },
        {
          segmentKey: "wall_balls",
          type: "station",
          label: "Wall Balls",
          percentile: 5,
          userSeconds: 900,
          frameGapSeconds: 700,
        },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.match(htmlBody, /unusually large gap|double-check/i);
  });

  it("M-9: no anomaly warning when all gaps are within normal range", () => {
    const analysis = mockAnalysis({
      segments: [
        { segmentKey: "total_time", type: "aggregate", percentile: 40 },
        {
          segmentKey: "wall_balls",
          type: "station",
          label: "Wall Balls",
          percentile: 25,
          userSeconds: 420,
          frameGapSeconds: 120,
        },
      ],
    });
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    assert.doesNotMatch(htmlBody, /unusually large gap|double-check these times/i);
  });

  it("M-10: suppresses main-insight gap claims when top-level gaps do not reconcile to total", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_95" },
      segments: [
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2100, benchmarkMedianSeconds: 2200, frameGapSeconds: -100, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2400, benchmarkMedianSeconds: 2544, frameGapSeconds: -144, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 400, benchmarkMedianSeconds: 358, frameGapSeconds: 42, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5762, benchmarkMedianSeconds: 5545, frameGapSeconds: 217, percentile: 42, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    assert.match(mainInsight, /One or more split values look unusual/i);
    assert.match(mainInsight, /Treat the limiter ranking as directional until those times are checked/i);
    assert.doesNotMatch(mainInsight, /Both running and station performance are contributing[\s\S]*station time is already ahead/i);
    assert.match(htmlBody, /unusually large gap|double-check/i);
  });

  it("M-10: station-only penalties do not get double-counted in top-level gap reconciliation", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_70" },
      penalties: [{ station: "wall_balls", penaltySeconds: 300 }],
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4200, benchmarkMedianSeconds: 3830, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 1980, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, benchmarkMedianSeconds: 1550, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 300, benchmarkMedianSeconds: 300, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 520, benchmarkMedianSeconds: 300, frameGapSeconds: 220, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    assert.doesNotMatch(mainInsight, /One or more split values look unusual/i);
    assert.doesNotMatch(mainInsight, /Treat the limiter ranking as directional until those times are checked/i);
    assert.doesNotMatch(htmlBody, /unusually large gap|double-check/i);
    assert.doesNotMatch(htmlBody, /Net of penalties/);
  });

  it("M-10: run-attributed penalties still reconcile after the running gap is netted", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_70" },
      penalties: [{ station: "run_3", penaltySeconds: 300 }],
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4500, benchmarkMedianSeconds: 3830, frameGapSeconds: 670, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 1980, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 2000, benchmarkMedianSeconds: 1550, frameGapSeconds: 450, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 300, benchmarkMedianSeconds: 300, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "run_3", label: "Run 3", type: "run", userSeconds: 720, benchmarkMedianSeconds: 300, frameGapSeconds: 420, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");

    assert.match(htmlBody, /Net of penalties/);
    assert.doesNotMatch(htmlBody, /unusually large gap|double-check/i);
  });

  it("M-10: no-penalty top-level gap reconciliation remains unchanged", () => {
    const analysis = mockAnalysis({
      benchmarkContext: { achievedBand: "sub_70" },
      penalties: [],
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4200, benchmarkMedianSeconds: 3830, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 1980, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, benchmarkMedianSeconds: 1550, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 300, benchmarkMedianSeconds: 300, frameGapSeconds: 0, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");

    assert.doesNotMatch(htmlBody, /unusually large gap|double-check/i);
    assert.doesNotMatch(htmlBody, /Net of penalties/);
  });

  it("MAIN INSIGHT station-performance framing does not name a run split", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_70",
        nextBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4200, benchmarkMedianSeconds: 3830, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 1980, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, benchmarkMedianSeconds: 1550, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 300, benchmarkMedianSeconds: 300, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 480, benchmarkMedianSeconds: 300, frameGapSeconds: 180, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 390, benchmarkMedianSeconds: 300, frameGapSeconds: 90, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    assert.match(mainInsight, /station performance, especially Wall Balls/i);
    assert.doesNotMatch(mainInsight, /station performance, especially Run 1/i);
  });

  it("MAIN INSIGHT running-pace framing does not name a station split", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_70",
        nextBand: "sub_65",
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4200, benchmarkMedianSeconds: 3830, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, benchmarkMedianSeconds: 2050, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, benchmarkMedianSeconds: 1480, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 300, benchmarkMedianSeconds: 300, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 480, benchmarkMedianSeconds: 300, frameGapSeconds: 180, confidence: "high" },
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 390, benchmarkMedianSeconds: 300, frameGapSeconds: 90, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "analyse");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    assert.match(mainInsight, /running pace, especially Run 1/i);
    assert.doesNotMatch(mainInsight, /running pace, especially Wall Balls/i);
  });

  it("target MAIN INSIGHT station-performance framing names the true top split even when it's a run", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_70",
        goalBenchmarkGroup: { targetFinishSeconds: 3900, label: "sub-65" },
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4270, goalBenchmarkSeconds: 3900, exactTargetSeconds: 3900, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, goalBenchmarkSeconds: 1980, exactTargetSeconds: 1980, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, goalBenchmarkSeconds: 1550, exactTargetSeconds: 1550, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 370, goalBenchmarkSeconds: 370, exactTargetSeconds: 370, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 480, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, frameGapSeconds: 180, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 390, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, frameGapSeconds: 90, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    // Stations lead the aggregate gap, but Run 1's single-segment gap (180s) is bigger than
    // Wall Balls' (90s), so the "biggest target opportunity" claim must match the split table's
    // #1 row, not just the leading category.
    assert.match(mainInsight, /gap is led by station performance/i);
    assert.match(mainInsight, /Run 1 is the biggest target opportunity/i);
    assert.doesNotMatch(mainInsight, /Wall Balls (is|are) the biggest target opportunity/i);
  });

  it("target MAIN INSIGHT running-pace framing names the true top split even when it's a station", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        achievedBand: "sub_70",
        goalBenchmarkGroup: { targetFinishSeconds: 3900, label: "sub-65" },
        primaryBenchmarkGroup: { label: "Open Male" },
      },
      segments: [
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 4270, goalBenchmarkSeconds: 3900, exactTargetSeconds: 3900, frameGapSeconds: 370, confidence: "high" },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", userSeconds: 2200, goalBenchmarkSeconds: 2050, exactTargetSeconds: 2050, frameGapSeconds: 150, confidence: "high" },
        { segmentKey: "run_time", label: "Running", type: "aggregate", userSeconds: 1700, goalBenchmarkSeconds: 1480, exactTargetSeconds: 1480, frameGapSeconds: 220, confidence: "high" },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", userSeconds: 370, goalBenchmarkSeconds: 370, exactTargetSeconds: 370, frameGapSeconds: 0, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 480, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, frameGapSeconds: 180, confidence: "high" },
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 390, goalBenchmarkSeconds: 300, exactTargetSeconds: 300, frameGapSeconds: 90, confidence: "high" },
      ],
    });

    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    const mainInsight = extractSection(htmlBody, "MAIN INSIGHT", "SEGMENT PROFILE");

    // Running leads the aggregate gap, but Wall Balls' single-segment gap (180s) is bigger than
    // Run 1's (90s) — this is the exact shape of the reported bug (Farmers Carry vs. Run 8):
    // the "biggest target opportunity" claim must name the station, matching the split table's
    // #1 row, not just the leading category.
    assert.match(mainInsight, /gap is led by running pace/i);
    assert.match(mainInsight, /Wall Balls are the biggest target opportunity/i);
    assert.doesNotMatch(mainInsight, /Run 1 is the biggest target opportunity/i);
  });
});

describe("feature-144: gapPill directional badge and route guard", () => {
  it("gapPill: +13s gap renders amber (#fef3c7)", () => {
    const html = gapPill(13);
    assert.ok(html.includes("#fef3c7"), `expected amber; got: ${html}`);
    assert.ok(!html.includes("#f1f5f9"), "should not be grey");
  });

  it("gapPill: exactly 0 gap renders grey (#f1f5f9)", () => {
    const html = gapPill(0);
    assert.ok(html.includes("#f1f5f9"), `expected grey; got: ${html}`);
  });

  it("gapPill: -13s gap renders green (#dcfce7)", () => {
    const html = gapPill(-13);
    assert.ok(html.includes("#dcfce7"), `expected green; got: ${html}`);
  });

  it("renderTargetRoadmap: emits unavailability note when running absent and station gap exceeds total gap", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      segments: [
        {
          segmentKey: "total_time",
          type: "aggregate",
          frameGapSeconds: 761,
          goalBenchmarkSeconds: 3600,
          userSeconds: 4361,
        },
        {
          segmentKey: "work_time",
          type: "aggregate",
          frameGapSeconds: 1399,
          userSeconds: 4399,
        },
        // no run_time segment — running data unavailable
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), null, "target");
    assert.match(htmlBody, /running split data/i);
    assert.doesNotMatch(htmlBody, /from station efficiency/i);
  });

  it("buildEmailReport hero headline uses the largest seconds gap", () => {
    const analysis = mockAnalysis({
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      headline: {
        biggestLimiter: { label: "SkiErg", segmentKey: "ski_erg", timeGapSeconds: 96, percentile: 38 },
      },
      segments: [
        { segmentKey: "total_time", type: "aggregate", frameGapSeconds: 761, goalBenchmarkSeconds: 3600, userSeconds: 4361, percentile: 45 },
        { segmentKey: "ski_erg", type: "station", label: "SkiErg", frameGapSeconds: 96, userSeconds: 360, percentile: 38 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 89, userSeconds: 340, percentile: 35 },
      ],
    });
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      heroCopy: { headline: "THE ROUTE TO 1:00:00 STARTS WITH SKIERG", subline: null, gainDisplay: null },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { htmlBody } = buildEmailReport({ sections: [splitSection] }, analysis, mockContext(), interpretation, "target");
    assert.match(htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH SKIERG/i);
    assert.doesNotMatch(htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS/i);
  });

  it("keeps email, carousel, race card, and caption on the same largest seconds-gap limiter", () => {
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        comparisonOptions: [{ percentile: 72, topPercent: 28 }],
        achievedBand: "sub_65",
      },
      headline: {
        biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", type: "station", timeGapSeconds: 105, percentile: 60 },
        biggestStrength: { label: "SkiErg", segmentKey: "ski_erg", type: "station", percentile: 82 },
      },
      timePotential: { headlineGainSeconds: 105 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", frameGapSeconds: 761, goalBenchmarkSeconds: 3600, userSeconds: 4361, percentile: 45 },
        { segmentKey: "ski_erg", type: "station", label: "SkiErg", frameGapSeconds: -20, userSeconds: 280, percentile: 82 },
        { segmentKey: "sled_push", type: "station", label: "Sled Push", frameGapSeconds: 95, userSeconds: 250, percentile: 30 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 105, userSeconds: 400, percentile: 60 },
      ],
    });
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      heroCopy: { headline: "THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS", subline: null, gainDisplay: null },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };
    const email = buildEmailReport(mockReport(), analysis, athleteContext, interpretation, "target");
    const carousel = buildTemplateA(analysis, [], athleteContext);
    const raceCard = buildHyroxRaceCardData(analysis, athleteContext);
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext, analysisJson: analysis });

    assert.match(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS/i);
    assert.doesNotMatch(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH SLED PUSH/i);
    assert.equal(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[3].station, "WALL BALLS");
    assert.equal(raceCard.biggestLimiter.name, "Wall Balls");
    assert.match(caption, /Biggest opportunity: WALL BALLS/);
    assert.doesNotMatch(caption, /Biggest opportunity: SLED PUSH/);
  });

  it("names RoxZone as the hero limiter when it is the dominant gap, not a smaller station gap", () => {
    // RoxZone (105s) clearly dominates Wall Balls (20s) by the 2.5x ratio, mirroring the
    // real-world case where a tight elite race's biggest single opportunity is RoxZone.
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        comparisonOptions: [{ percentile: 72, topPercent: 28 }],
        achievedBand: "sub_65",
      },
      headline: {
        biggestLimiter: { label: "RoxZone", segmentKey: "roxzone_time", type: "aggregate", timeGapSeconds: 105, percentile: 20 },
        biggestStrength: { label: "SkiErg", segmentKey: "ski_erg", type: "station", percentile: 82 },
      },
      timePotential: { headlineGainSeconds: 105 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", frameGapSeconds: 761, goalBenchmarkSeconds: 3600, userSeconds: 4361, percentile: 45 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "Total Roxzone Time", frameGapSeconds: 105, userSeconds: 400, percentile: 20 },
        { segmentKey: "ski_erg", type: "station", label: "SkiErg", frameGapSeconds: -20, userSeconds: 280, percentile: 82 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 20, userSeconds: 300, percentile: 60 },
      ],
    });
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      heroCopy: { headline: "THE ROUTE TO 1:00:00 STARTS WITH ROXZONE", subline: null, gainDisplay: null },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };
    const email = buildEmailReport(mockReport(), analysis, athleteContext, interpretation, "target");
    const carousel = buildTemplateA(analysis, [], athleteContext);
    const raceCard = buildHyroxRaceCardData(analysis, athleteContext);
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext, analysisJson: analysis });

    assert.match(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH ROXZONE/i);
    assert.doesNotMatch(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS/i);
    assert.equal(carousel.slides[0].biggest_limiter, "ROXZONE");
    assert.equal(raceCard.biggestLimiter.name, "RoxZone");
    assert.match(caption, /Biggest opportunity: ROXZONE/);
    assert.doesNotMatch(caption, /Biggest opportunity: WALL BALLS/);
  });

  it("keeps subject, hero, opportunities table, and target priorities on the largest seconds-gap opportunity", () => {
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_65",
      },
      headline: {
        biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", type: "station", timeGapSeconds: 105, percentile: 60 },
        biggestStrength: { label: "SkiErg", segmentKey: "ski_erg", type: "station", percentile: 82 },
      },
      timePotential: { headlineGainSeconds: 105 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total", frameGapSeconds: 761, goalBenchmarkSeconds: 3600, userSeconds: 4361, percentile: 45 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", frameGapSeconds: 220, userSeconds: 2200, percentile: 44 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", frameGapSeconds: 540, userSeconds: 2161, percentile: 48 },
        { segmentKey: "ski_erg", type: "station", label: "SkiErg", frameGapSeconds: -20, userSeconds: 280, percentile: 82 },
        { segmentKey: "sled_push", type: "station", label: "Sled Push", frameGapSeconds: 95, userSeconds: 250, percentile: 30 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 105, userSeconds: 400, percentile: 60 },
      ],
    });
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      heroCopy: { headline: "THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS", subline: null, gainDisplay: null },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { subject, htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      analysis,
      mockContext({ targetFinishTimeSeconds: 3600 }),
      interpretation,
      "target",
    );

    assert.match(subject, /start with Wall Balls/i);
    assert.doesNotMatch(subject, /Sled Push/i);
    assert.match(htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS/i);
    assert.doesNotMatch(htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH SLED PUSH/i);

    function sectionBetween(startMarker, endMarker) {
      const start = htmlBody.lastIndexOf(startMarker);
      const end = htmlBody.indexOf(endMarker, start);
      if (start === -1 || end === -1 || end <= start) return "";
      return htmlBody.slice(start, end);
    }

    const opportunitiesSection = sectionBetween("Biggest opportunities", "Strengths to protect");
    assert.ok(opportunitiesSection.indexOf("Sled Push") > -1, "Sled Push should appear in opportunities");
    assert.ok(opportunitiesSection.indexOf("Wall Balls") > -1, "Wall Balls should remain eligible");
    assert.ok(
      opportunitiesSection.indexOf("Wall Balls") < opportunitiesSection.indexOf("Sled Push"),
      "Wall Balls should be the first opportunity because it has the larger seconds gap",
    );

    const prioritiesSection = sectionBetween("TARGET PRIORITIES", "Biggest opportunities");
    assert.match(prioritiesSection, /Wall Balls and station efficiency/i);
    assert.doesNotMatch(prioritiesSection, /Sled Push and station efficiency/i);
  });

  it("keeps Run 8 ahead of Run 7 when it has the larger seconds gap", () => {
    const analysis = mockAnalysis({
      race: { finishTimeSeconds: 7200, targetTimeSeconds: 6300 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 6300, label: "sub-105" },
        primaryBenchmarkGroup: { label: "Open Male" },
        achievedBand: "sub_120",
      },
      headline: {
        biggestLimiter: { label: "Run 8", segmentKey: "run_8", type: "run", timeGapSeconds: 865, percentile: 90 },
      },
      timePotential: { headlineGainSeconds: 865 },
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total", frameGapSeconds: 900, goalBenchmarkSeconds: 6300, userSeconds: 7200, percentile: 45 },
        { segmentKey: "work_time", type: "aggregate", label: "Stations", frameGapSeconds: 90, userSeconds: 2600, percentile: 44 },
        { segmentKey: "run_time", type: "aggregate", label: "Running", frameGapSeconds: 810, userSeconds: 4600, percentile: 18 },
        { segmentKey: "run_7", type: "run", label: "Run 7", frameGapSeconds: 857, userSeconds: 720, percentile: 12 },
        { segmentKey: "run_8", type: "run", label: "Run 8", frameGapSeconds: 865, userSeconds: 730, percentile: 90 },
      ],
    });
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: { segments: analysis.segments, benchmarkContext: analysis.benchmarkContext },
    };
    const { subject, htmlBody } = buildEmailReport(
      { sections: [splitSection] },
      analysis,
      mockContext({ targetFinishTimeSeconds: 6300 }),
      null,
      "target",
    );

    function sectionBetween(startMarker, endMarker) {
      const start = htmlBody.lastIndexOf(startMarker);
      const end = htmlBody.indexOf(endMarker, start);
      if (start === -1 || end === -1 || end <= start) return "";
      return htmlBody.slice(start, end);
    }

    assert.match(subject, /start with Run 8/i);
    assert.doesNotMatch(subject, /Run 7/i);

    const opportunitiesSection = sectionBetween("Biggest opportunities", "Strengths to protect");
    assert.ok(opportunitiesSection.indexOf("Run 7") > -1, "Run 7 should appear in opportunities");
    assert.ok(opportunitiesSection.indexOf("Run 8") > -1, "Run 8 should remain eligible");
    assert.ok(
      opportunitiesSection.indexOf("Run 8") < opportunitiesSection.indexOf("Run 7"),
      "Run 8 should rank before Run 7 because it has the larger seconds gap",
    );

    const prioritiesSection = sectionBetween("TARGET PRIORITIES", "Biggest opportunities");
    assert.match(prioritiesSection, /Run 8 and station efficiency/i);
    assert.doesNotMatch(prioritiesSection, /Run 7 and station efficiency/i);
  });
});

