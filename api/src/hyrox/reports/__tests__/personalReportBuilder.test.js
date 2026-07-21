import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPersonalReport } from "../personalReportBuilder.js";

function minimalAnalysis(overrides = {}) {
  return {
    headline: { biggestLimiter: null, biggestStrength: null },
    segments: [],
    stationBreakdown: [],
    penalties: [],
    scores: { engineScore: 55, strengthScore: 55 },
    timePotential: { headlineGainSeconds: 0 },
    runningAnalysis: { available: false },
    roxzoneAnalysis: { available: false },
    benchmarkContext: {
      primaryBenchmarkGroup: { key: "hyrox:v1:open:male:all", label: "Open Male" },
      goalBenchmarkGroup: null,
    },
    ...overrides,
  };
}

function makeSegments(count = 16) {
  const keys = [
    "run_1", "ski_erg", "run_2", "sled_push", "run_3", "sled_pull",
    "run_4", "burpee_broad_jump", "run_5", "row", "run_6", "farmers_carry",
    "run_7", "sandbag_lunges", "run_8", "wall_balls",
  ];
  const types = [
    "run", "station", "run", "station", "run", "station",
    "run", "station", "run", "station", "run", "station",
    "run", "station", "run", "station",
  ];
  return keys.slice(0, count).map((key, index) => ({
    segmentKey: key,
    type: types[index],
    label: key.replace(/_/g, " "),
    userSeconds: 300 + index * 10,
    benchmarkMedianSeconds: 290 + index * 10,
    goalBenchmarkSeconds: null,
    timeGapToMedianSeconds: 10,
    timeGapToGoalSeconds: null,
    percentile: 40,
    confidence: "high",
  }));
}

function makeSegmentsWithRoxzone(count = 16) {
  return [
    ...makeSegments(count),
    {
      segmentKey: "roxzone_time",
      type: "aggregate",
      label: "Total RoxZone Time",
      userSeconds: 240,
      benchmarkMedianSeconds: 210,
      goalBenchmarkSeconds: null,
      timeGapToMedianSeconds: 30,
      timeGapToGoalSeconds: null,
      percentile: 45,
      confidence: "medium",
    },
  ];
}

describe("buildPersonalReport - race_split_breakdown section", () => {
  it("includes race_split_breakdown when 8 or more split segments present", () => {
    const analysis = minimalAnalysis({ segments: makeSegments(16) });
    const { sections } = buildPersonalReport(analysis, [], {});
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.ok(tableSection, "race_split_breakdown section expected");
  });

  it("omits race_split_breakdown when fewer than 8 split segments", () => {
    const analysis = minimalAnalysis({ segments: makeSegments(4) });
    const { sections } = buildPersonalReport(analysis, [], {});
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.ok(!tableSection, "race_split_breakdown section should be absent");
  });

  it("tableData carries segments and penalties", () => {
    const penalties = [{ station: "run_5", penaltySeconds: 300 }];
    const analysis = minimalAnalysis({ segments: makeSegments(16), penalties });
    const { sections } = buildPersonalReport(analysis, [], {});
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.ok(Array.isArray(tableSection.tableData.segments), "tableData.segments should be array");
    assert.deepEqual(tableSection.tableData.penalties, penalties);
  });

  it("tableData carries target finish time when supplied", () => {
    const analysis = minimalAnalysis({ segments: makeSegments(16) });
    const { sections } = buildPersonalReport(analysis, [], { targetFinishTimeSeconds: 4800 });
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.equal(tableSection.tableData.targetFinishTimeSeconds, 4800);
  });

  it("content is an array of strings (plain-text fallback)", () => {
    const analysis = minimalAnalysis({ segments: makeSegments(16) });
    const { sections } = buildPersonalReport(analysis, [], {});
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.ok(Array.isArray(tableSection.content), "content should be an array");
    assert.ok(tableSection.content.every((line) => typeof line === "string"), "every content item should be a string");
  });

  it("plain-text fallback includes total RoxZone when available", () => {
    const analysis = minimalAnalysis({ segments: makeSegmentsWithRoxzone(16) });
    const { sections } = buildPersonalReport(analysis, [], {});
    const tableSection = sections.find((section) => section.sectionKey === "race_split_breakdown");
    assert.ok(tableSection.content.some((line) => line.includes("Total RoxZone Time")), "RoxZone row expected");
  });

  it("orders focus sections after split table while still building suppressed text sections", () => {
    const analysis = minimalAnalysis({ segments: makeSegments(16) });
    const { sections } = buildPersonalReport(analysis, [], {});
    const limiterIdx = sections.findIndex((section) => section.sectionKey === "biggest_limiter");
    const tableIdx = sections.findIndex((section) => section.sectionKey === "race_split_breakdown");
    const recIdx = sections.findIndex((section) => section.sectionKey === "recommended_focus_areas");
    const potentialIdx = sections.findIndex((section) => section.sectionKey === "time_potential");
    assert.ok(limiterIdx > tableIdx, "suppressed station breakdown should still be built after split table");
    assert.ok(tableIdx < recIdx, "recommendations should come after split table");
    assert.ok(recIdx < limiterIdx, "recommendations should come before suppressed station breakdown");
    assert.ok(tableIdx < potentialIdx, "table should come before time_potential");
  });

  it("adds data confidence section near the top for partial data", () => {
    const analysis = minimalAnalysis({
      analysisScope: "partial",
      dataQuality: {
        inputCompleteness: 0.67,
        warnings: ["partial_split_data", "roxzone_inferred_from_unallocated_time"],
      },
      segments: makeSegments(16),
    });
    const { sections } = buildPersonalReport(analysis, [], {});
    const confidenceIdx = sections.findIndex((section) => section.sectionKey === "data_confidence");
    assert.ok(confidenceIdx > -1, "data_confidence section expected");
    assert.ok(confidenceIdx <= 1, "data_confidence should appear near the top");
    assert.match(sections[confidenceIdx].content.join(" "), /partial split data|RoxZone/i);
  });

  it("names a split estimated from residual in the data confidence warning", () => {
    const analysis = minimalAnalysis({
      analysisScope: "partial",
      dataQuality: {
        inputCompleteness: 0.94,
        warnings: ["split_estimated_from_residual"],
        estimatedSplitKeys: ["row"],
      },
      segments: makeSegments(16),
    });
    const { sections } = buildPersonalReport(analysis, [], {});
    const confidence = sections.find((section) => section.sectionKey === "data_confidence");

    assert.ok(confidence, "data_confidence section expected");
    assert.match(confidence.content.join(" "), /Row split was missing/i);
    assert.doesNotMatch(confidence.content.join(" "), /Some race splits are missing/i);
  });

  it("uses target-profile language for target-mode station breakdown", () => {
    const analysis = minimalAnalysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "hyrox:v1:open:male:all", label: "Open Male" },
        goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "60:00 target" },
      },
      headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120 }, biggestStrength: null },
      stationBreakdown: [
        { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 120, percentile: 30, confidence: "high" },
        { segmentKey: "sled_push", label: "Sled Push", timeGapSeconds: 80, percentile: 42, confidence: "high" },
        { segmentKey: "ski_erg", label: "SkiErg", timeGapSeconds: -35, percentile: 80, confidence: "high" },
      ],
    });
    const { sections } = buildPersonalReport(analysis, [], {});
    const limiterSection = sections.find((section) => section.sectionKey === "biggest_limiter");

    assert.ok(limiterSection.content.includes("Your biggest station gaps against your target profile:"));
    assert.ok(limiterSection.content.some((line) => line.includes("Target opportunity") && line.includes("vs target profile")));
    assert.ok(limiterSection.content.includes("Protect this strength: SkiErg — ahead of target profile."));
    assert.ok(!limiterSection.content.join(" ").includes("vs your benchmark band"));
  });

  it("does not flag exactly 8% manageable run fade as material in the summary", () => {
    const analysis = minimalAnalysis({
      runningAnalysis: { available: true, runFadePct: 8, interpretation: "manageable_late_fade" },
    });
    const { sections } = buildPersonalReport(analysis, [], {}, {
      primaryThesis: { category: "running" },
      secondaryTheses: [],
    });
    const summary = sections.find((section) => section.sectionKey === "executive_summary");

    assert.doesNotMatch(summary.content.join(" "), /fatigue resistance and pacing deserve attention/i);
  });

  it("flags material run fade in the summary when interpretation says late fade is present", () => {
    const analysis = minimalAnalysis({
      runningAnalysis: { available: true, runFadePct: 9, interpretation: "late_fade_present" },
    });
    const { sections } = buildPersonalReport(analysis, [], {}, {
      primaryThesis: { category: "running" },
      secondaryTheses: [],
    });
    const summary = sections.find((section) => section.sectionKey === "executive_summary");

    assert.match(summary.content.join(" "), /fatigue resistance and pacing deserve attention/i);
  });
});
