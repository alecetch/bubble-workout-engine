import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmailReport } from "../emailReportBuilder.js";

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

describe("buildEmailReport visual redesign", () => {
  it("renders a full HTML document", () => {
    const report = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(report.htmlBody.startsWith("<!DOCTYPE html>"), true);
  });

  it("does not emit class attributes", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes('class="'), false);
  });

  it("does not emit external stylesheet links", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("does not emit style blocks", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(/<style/i.test(htmlBody), false);
  });

  it("keeps the existing subject", () => {
    const { subject } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(subject, "Your HYROX bottleneck is Wall Balls");
  });

  it("keeps text body plain", () => {
    const { textBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(/<[a-z][\s\S]*>/i.test(textBody), false);
  });

  it("renders the dark brand header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /background-color:#080e1a/);
  });

  it("renders the FORMA brand", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, />FORMA</);
  });

  it("uses the blue accent repeatedly", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.ok((htmlBody.match(/#08a7f5/g) ?? []).length >= 2);
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

  it("renders finish time in the metric strip", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /1:33:32/);
  });

  it("renders overall rank in the metric strip", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /34th percentile|34th/i);
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
    assert.match(htmlBody, /#7c3aed/);
  });

  it("suppresses biggest strength section", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("BIGGEST STRENGTH"), false);
  });

  it("suppresses station breakdown section", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("STATION BREAKDOWN"), false);
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

  it("renders CTA button text", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /BUILD MY HYROX TRAINING PLAN/);
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

  it("renders forma.fit in footer", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /forma\.fit/);
  });

  it("suppresses athlete background section when present", () => {
    const { htmlBody } = buildEmailReport(mockReport([
      { sectionKey: "athlete_background", title: "Your Background in Context", content: "Your running background gives useful context." },
    ]), mockAnalysis(), mockContext());
    assert.equal(htmlBody.includes("YOUR BACKGROUND IN CONTEXT"), false);
    assert.equal(htmlBody.includes("Your running background gives useful context."), false);
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
    assert.match(htmlBody, /NEXT TRAINING FOCUS/);
    assert.ok(!htmlBody.includes("a/"));
    assert.ok(!htmlBody.includes("b/"));
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
    assert.ok(!htmlBody.includes("a/"), "No lettered list for single contributor");
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
    assert.ok(htmlBody.includes("Weakness"));
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

describe("analyse mode email", () => {
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

  it("subject says bottleneck in target mode with a limiter", () => {
    const personal = mockReport();
    const email = buildEmailReport(personal, mockAnalysis(), mockContext(), null, "target");
    assert.match(email.subject, /bottleneck/i);
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

  it("analyse mode CTA references marginal gains not bottleneck", () => {
    const personal = mockReport();
    const email = buildEmailReport(personal, mockAnalysis(), mockContext(), { primaryThesis: { category: "high_performer" } }, "analyse");
    assert.doesNotMatch(email.htmlBody, /targeting your bottleneck/i);
    assert.match(email.htmlBody, /marginal gains|preserv/i);
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

  function splitTableSection({ overrides = {}, penalties = [], benchmarkContext, targetFinishTimeSeconds = null } = {}) {
    const segments = raceOrder.map(([key, label, type], index) => {
      const baseGap = index === 1 ? 120 : index === 3 ? 80 : index === 5 ? -30 : 10;
      return splitSegment(key, label, type, baseGap, overrides[key]);
    });
    segments.push(
      splitSegment("run_time", "Run Time", "aggregate", 60, overrides.run_time),
      splitSegment("work_time", "Work Time", "aggregate", 240, overrides.work_time),
      splitSegment("roxzone_time", "RoxZone Time", "aggregate", 45, overrides.roxzone_time),
      splitSegment("total_time", "Total Time", "aggregate", 300, overrides.total_time),
    );
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

  function renderSplit(overrides = {}) {
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

  it("renders reduced split detail", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /REDUCED SPLIT DETAIL/);
    assert.match(htmlBody, /View the full split report/);
    assert.match(htmlBody, /\/api\/hyrox\/carousel\/22222222-2222-4222-8222-222222222222/);
    assert.ok(!htmlBody.includes("FULL SPLIT DETAIL"));
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

  it("renders reduced rows by opportunity size", () => {
    const htmlBody = renderSplit();
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    assert.ok(detailHtml.indexOf(">SkiErg<") < detailHtml.indexOf(">Sled Push<"));
  });

  it("does not render aggregate rows in reduced detail", () => {
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

  it("highlights the biggest positive gaps and faster splits", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /#fff4f4/);
    assert.match(htmlBody, /#22c55e/);
    assert.match(htmlBody, /\+2:00/);
    assert.match(htmlBody, /\u22120:30/);
  });

  it("renders penalties in reduced detail when present", () => {
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

  it("material penalties: renders adjusted, penalty, and net-running summary cards", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Without penalties"), "Adjusted card should appear");
    assert.ok(htmlBody.includes("Fastest win"), "Penalties card should appear");
    assert.ok(htmlBody.includes("Net of penalties"), "Running card note should say Net of penalties");
  });

  it("material penalties: gap breakdown includes purple penalty attribution", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("#7c3aed"), "purple penalty colour should appear");
    assert.ok(htmlBody.includes("including penalties"), 'total gap label should say "including penalties"');
    assert.ok(htmlBody.includes("Running is shown net of penalties"), "gap breakdown should explain net running");
  });

  it("material penalties: penalty row appears before segment rows in reduced split table", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    const penaltyIdx = detailHtml.indexOf(">Penalties<");
    const firstSegmentIdx = detailHtml.indexOf(">SkiErg<");
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

    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    assert.ok(!detailHtml.includes("Run 5"), "Run 5 should not reappear as a faster split after penalty adjustment");
    assert.ok(detailHtml.includes("Penalty time is shown separately above, so the split table focuses on performance gaps rather than execution penalties."));
  });

  it("material penalties: reduced split detail shows adjusted numbers when a penalty split remains a gap", () => {
    const htmlBody = renderSplit({
      penalties: [{ segmentKey: "run_5", penaltySeconds: 300 }],
      overrides: {
        run_5: { userSeconds: 680, goalBenchmarkSeconds: 300, timeGapToMedianSeconds: 400 },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    assert.ok(detailHtml.includes("Run 5"));
    assert.ok(detailHtml.includes("penalty-adjusted from +6:20"));
    assert.ok(detailHtml.includes(">6:20<"), "Your time should be shown without the 5:00 penalty");
    assert.ok(detailHtml.includes("+1:20"), "Gap should be shown without the 5:00 penalty");
  });

  it("reduced split detail uses amber background for amber gaps", () => {
    const htmlBody = renderSplit({
      overrides: {
        farmers_carry: { userSeconds: 187, goalBenchmarkSeconds: 120, timeGapToMedianSeconds: 87 },
        sled_push: { userSeconds: 182, goalBenchmarkSeconds: 120, timeGapToMedianSeconds: 82 },
      },
    });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    const farmersSnippet = detailHtml.slice(detailHtml.indexOf("Farmers Carry") - 220, detailHtml.indexOf("Farmers Carry") + 500);
    const sledSnippet = detailHtml.slice(detailHtml.indexOf("Sled Push") - 220, detailHtml.indexOf("Sled Push") + 500);
    assert.ok(farmersSnippet.includes("background-color:#fffdf7"), "Farmers Carry +1:07 should use amber background");
    assert.ok(farmersSnippet.includes("color:#d97706"), "Farmers Carry +1:07 should use amber text");
    assert.ok(!farmersSnippet.includes("background-color:#fff4f4"), "Farmers Carry +1:07 should not use red background");
    assert.ok(sledSnippet.includes("background-color:#fffdf7"), "Sled Push +1:02 should use amber background");
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
    assert.ok(stripHtml.includes("RANK"));
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
    assert.ok(calloutHtml.includes("background-color:#f5f3ff"), "penalty card should use soft purple background");
  });

  it("material penalties: main insight distinguishes fitness, penalties, and penalty-inflated Run 5", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "run_5", penaltySeconds: 300 }] });
    assert.ok(htmlBody.includes("Stations remain the largest fitness limiter"));
    assert.ok(htmlBody.includes("penalties are your fastest controllable win"));
    assert.ok(htmlBody.includes("Run 5 is penalty-inflated"));
    assert.ok(!htmlBody.includes("Biggest opportunities: Run 5"));
  });

  it("material penalties: method note explains penalty separation", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(
      htmlBody.includes("execution leakage") || htmlBody.includes("separated from running"),
      "method note should explain penalty separation",
    );
  });

  it("no penalties: method note does not mention penalty separation", () => {
    const htmlBody = renderSplit({ penalties: [] });
    assert.ok(!htmlBody.includes("execution leakage"), "method note should not mention penalties when none present");
  });

  it("small penalties: keeps normal benchmark snapshot and four-card summary", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 20 }] });
    const stripHtml = htmlBody.slice(htmlBody.indexOf("YOUR RACE"), htmlBody.indexOf("PENALTIES") + 400);
    assert.ok(stripHtml.includes("BENCHMARK"));
    assert.ok(!stripHtml.includes("ADJUSTED"));
    assert.ok(!htmlBody.includes("Without penalties"));
    assert.ok(!htmlBody.includes("Net of penalties"));
  });

  it("material penalties: reduced table uses execution label and no avoidable wording", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    assert.ok(detailHtml.includes(">execution<"));
    assert.ok(!detailHtml.includes(">avoidable<"));
  });

  it("material penalties: training focus uses the v4 fixed priority list without repeated sandbag items", () => {
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
    assert.ok(htmlBody.includes("Clean execution first, then sandbag durability."));
    assert.ok(htmlBody.includes("Reclaim penalty time through station standards"));
    assert.ok(htmlBody.includes("Sandbag lunge capacity under fatigue"));
    assert.ok(htmlBody.includes("Sled pull efficiency and grip control"));
    assert.ok(htmlBody.includes("Posterior-chain strength endurance"));
    assert.ok(htmlBody.includes("Race-fatigued station practice"));
    assert.equal((htmlBody.match(/Sandbag lunge/gi) ?? []).length, 1);
  });

  it("material penalties: training volume and muscle signal acknowledge penalty-first context", () => {
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
    assert.ok(htmlBody.includes("Run 5 loss is penalty-inflated"));
    assert.ok(htmlBody.includes("do not treat the full raw running gap as a running-volume problem"));
    assert.ok(htmlBody.includes("Training focus: clean station standards first"));
  });

  it("still renders reduced detail when no goal group exists", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
    });
    assert.match(htmlBody, /REDUCED SPLIT DETAIL/);
  });

  it("keeps reduced detail email-safe", () => {
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
    assert.equal(/<style/i.test(htmlBody), false);
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("renders gap breakdown and remains email-safe", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /GAP BREAKDOWN/);
    assert.equal(htmlBody.includes('class="'), false);
    assert.equal(/<style/i.test(htmlBody), false);
    assert.equal(htmlBody.includes("<link"), false);
  });

  it("split table includes Rank column header", () => {
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
    assert.ok(htmlBody.includes(">Rank<"), `expected "Rank" header, not found in HTML`);
  });

  it("split table renders percentile value for a station with known percentile", () => {
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
    assert.ok(htmlBody.includes("8th"), "expected 8th percentile text in split table HTML");
  });

  it("split table renders high percentile as percentile rank, not top-percent shorthand", () => {
    const splitSection = {
      sectionKey: "race_split_breakdown",
      title: "Race Split Breakdown",
      tableData: {},
    };
    const analysisWithSplits = {
      ...mockAnalysis(),
      segments: [
        { segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 300, benchmarkMedianSeconds: 280, timeGapToMedianSeconds: 20, percentile: 80, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", userSeconds: 500, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 200, percentile: 8, confidence: "high" },
        { segmentKey: "total_time", label: "Total", type: "aggregate", userSeconds: 5612, benchmarkMedianSeconds: 5200, timeGapToMedianSeconds: 412, confidence: "high" },
      ],
      benchmarkContext: { primaryBenchmarkGroup: { label: "benchmark group" } },
    };
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithSplits, {}, null,
    );
    assert.ok(htmlBody.includes("80th percentile"), "expected high rank to render as percentile text");
    assert.ok(!htmlBody.includes("Top 20%"), "split table should not mix in top-percent shorthand");
  });

  it("reduced split table does not render RUN inline pills", () => {
    const htmlBody = renderSplit();
    assert.ok(!htmlBody.includes(">RUN<"), "split table should not contain RUN pill");
  });

  it("reduced split table does not render STN inline pills", () => {
    const htmlBody = renderSplit();
    assert.ok(!htmlBody.includes(">STN<"), "split table should not contain STN pill");
  });

  it('split table uses "Gap" column header instead of "+/-"', () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.includes(">Gap<"), 'expected "Gap" column header');
    assert.ok(!htmlBody.includes("+/−"), 'should not contain old "+/−" header');
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

  it("renders all four summary card labels", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    for (const label of ["Race time", "Stations", "Running", "RoxZone"]) {
      assert.ok(htmlBody.includes(label), `expected summary card label ${label}`);
    }
  });

  it("race time summary card note reads Total gap", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Total gap"));
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

  it('RoxZone summary card shows "Strength to protect" for exceptional gap', () => {
    const htmlBody = renderRoxZoneGap(-60);
    assert.ok(htmlBody.includes("Strength to protect"), 'RoxZone card note should say "Strength to protect"');
    assert.ok(!htmlBody.includes("On benchmark"), 'should not say "On benchmark" for an exceptional RoxZone');
  });

  it("reduced split detail omits Type, Band, and Target column headers", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    const detailHtml = htmlBody.slice(htmlBody.indexOf("REDUCED SPLIT DETAIL"));
    assert.ok(!detailHtml.includes(">Type<"));
    assert.ok(!detailHtml.includes(">Band<"));
    assert.ok(!detailHtml.includes(">Target *<"));
  });

  it("reduced split table does not render RUN and STN inline pills", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(!htmlBody.includes(">RUN<"));
    assert.ok(!htmlBody.includes(">STN<"));
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

  it("segment column does not contain old inline 9px type tag", () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(!htmlBody.includes("font-size:9px;font-weight:700;text-transform:uppercase"));
  });

  it("snapshot strip final column has no right border when no penalties present", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis({ penalties: [] }), {}, null);
    assert.ok(!htmlBody.match(/OVERALL RANK[\s\S]{0,200}border-right:1px solid/),
      "OVERALL RANK cell should not have right border when no penalties");
  });

  it("gap column has at least 12px right padding", () => {
    const htmlBody = renderSplit();
    assert.ok(
      htmlBody.includes("padding-right:12px") || htmlBody.includes("padding:7px 12px"),
      "gap column should have at least 12px right padding",
    );
  });

  it('race time summary card note reads "Total gap"', () => {
    const { htmlBody } = buildEmailReport(
      { sections: [splitSection] }, analysisWithFullSplits, {}, null,
    );
    assert.ok(htmlBody.includes("Total gap"), 'race time card should show "Total gap" as note');
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
    assert.ok(snippet.includes("color:#64748b"), "secondary CTA link should use muted color");
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
