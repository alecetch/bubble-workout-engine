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

  it("renders the limiter hero headline", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /WALL BALLS IS YOUR BIGGEST OPPORTUNITY/);
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
    assert.match(htmlBody, /#e53e3e/);
  });

  it("renders biggest strength header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /BIGGEST STRENGTH/);
  });

  it("renders station breakdown header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /STATION BREAKDOWN/);
  });

  it("renders time potential header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /TIME POTENTIAL/);
  });

  it("uses red gap colour in station breakdown", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /#e53e3e/);
  });

  it("renders recommendations header", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /RECOMMENDED FOCUS AREAS/);
  });

  it("renders blue priority badge styling", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /<span style="[^"]*background-color:#08a7f5/);
  });

  it("renders likely contributors in recommendation rationale", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /Likely contributors/);
  });

  it("renders CTA button text", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /BUILD YOUR TRAINING PLAN/);
  });

  it("renders carousel link when submissionId is present", () => {
    const { htmlBody } = buildEmailReport(
      mockReport(),
      mockAnalysis({ submissionId: "11111111-1111-4111-8111-111111111111" }),
      mockContext(),
    );
    assert.match(htmlBody, /View your Instagram carousel slides/);
    assert.match(htmlBody, /\/api\/hyrox\/carousel\/11111111-1111-4111-8111-111111111111/);
  });

  it("renders forma.fit in footer", () => {
    const { htmlBody } = buildEmailReport(mockReport(), mockAnalysis(), mockContext());
    assert.match(htmlBody, /forma\.fit/);
  });

  it("renders athlete background section when present", () => {
    const { htmlBody } = buildEmailReport(mockReport([
      { sectionKey: "athlete_background", title: "Your Background in Context", content: "Your running background gives useful context." },
    ]), mockAnalysis(), mockContext());
    assert.match(htmlBody, /YOUR BACKGROUND IN CONTEXT/);
    assert.match(htmlBody, /border-left:3px solid #08a7f5/);
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

  it("renders lettered contributors sub-list when richRecommendations has 2+ contributors", () => {
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
    assert.match(htmlBody, /a\//);
    assert.match(htmlBody, /b\//);
    assert.match(htmlBody, /Penalties/);
    assert.match(htmlBody, /Sandbag Lunges/);
  });

  it("renders runGapNote as italic note below contributors", () => {
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
    assert.match(htmlBody, /4:54/);
    assert.match(htmlBody, /font-style:italic/);
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
});

describe("renderSplitTable", () => {
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
        segments: section.tableData.segments,
        penalties: section.tableData.penalties,
        benchmarkContext: section.tableData.benchmarkContext,
      }),
      mockContext(),
    ).htmlBody;
  }

  it("renders the split table header and benchmark label", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /RACE SPLIT BREAKDOWN/);
    assert.match(htmlBody, /Compared against Goal 80-85 min/);
    assert.match(htmlBody, /Target \*/);
  });

  it("renders race rows in HYROX race order", () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.indexOf(">Run 1<") < htmlBody.indexOf(">SkiErg<"));
    assert.ok(htmlBody.indexOf(">SkiErg<") < htmlBody.indexOf(">Run 2<"));
  });

  it("renders aggregate rows after race rows", () => {
    const htmlBody = renderSplit();
    assert.ok(htmlBody.indexOf(">Wall Balls<") < htmlBody.indexOf(">Total Running<"));
    assert.ok(htmlBody.indexOf(">Total Running<") < htmlBody.indexOf(">Total Stations<"));
    assert.ok(htmlBody.indexOf(">Total Stations<") < htmlBody.indexOf(">Total RoxZone<"));
    assert.ok(htmlBody.indexOf(">Total RoxZone<") < htmlBody.indexOf(">Total Race Time<"));
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
    assert.match(htmlBody, /#fff5f5/);
    assert.match(htmlBody, /border-left:3px solid #e53e3e/);
    assert.match(htmlBody, /#22c55e/);
    assert.match(htmlBody, /\+2:00/);
    assert.match(htmlBody, /\u22120:30/);
  });

  it("renders penalties immediately after total station time", () => {
    const htmlBody = renderSplit({ penalties: [{ station: "wall_balls", penaltySeconds: 300 }] });
    assert.ok(htmlBody.indexOf(">Total Stations<") < htmlBody.indexOf(">Penalties<"));
    assert.ok(htmlBody.indexOf(">Penalties<") < htmlBody.indexOf(">Total RoxZone<"));
    assert.ok(htmlBody.indexOf(">Total RoxZone<") < htmlBody.indexOf(">Total Race Time<"));
    assert.match(htmlBody, /\+5:00/);
  });

  it("omits penalty row when there are no penalties", () => {
    const htmlBody = renderSplit();
    assert.equal(htmlBody.includes(">Penalties<"), false);
  });

  it("falls back to the primary benchmark when no goal group exists", () => {
    const htmlBody = renderSplit({
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-39" } },
    });
    assert.match(htmlBody, /Compared against Open Men 30-39/);
  });

  it("renders missing and low-confidence split values safely", () => {
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
    assert.match(htmlBody, />\u2013</);
    assert.match(htmlBody, /~5:10/);
    assert.match(htmlBody, /#94a3b8/);
  });

  it("renders footnote copy and remains email-safe", () => {
    const htmlBody = renderSplit();
    assert.match(htmlBody, /Positive \(\+\) = slower than target; negative \(\u2212\) = faster/);
    assert.equal(htmlBody.includes('class="'), false);
    assert.equal(/<style/i.test(htmlBody), false);
    assert.equal(htmlBody.includes("<link"), false);
  });
});
