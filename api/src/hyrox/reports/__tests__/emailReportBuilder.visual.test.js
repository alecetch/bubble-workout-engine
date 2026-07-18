import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailReport } from "../emailReportBuilder.js";

const raceOrder = [
  ["run_1", "Run 1", "run", 65],
  ["ski_erg", "SkiErg", "station", 110],
  ["run_2", "Run 2", "run", 40],
  ["sled_push", "Sled Push", "station", 85],
  ["run_3", "Run 3", "run", 20],
  ["sled_pull", "Sled Pull", "station", -20],
  ["run_4", "Run 4", "run", 15],
  ["burpee_broad_jump", "Burpee Broad Jump", "station", 55],
  ["run_5", "Run 5", "run", 35],
  ["row", "Row", "station", 25],
  ["run_6", "Run 6", "run", 10],
  ["farmers_carry", "Farmers Carry", "station", 45],
  ["run_7", "Run 7", "run", 30],
  ["sandbag_lunges", "Sandbag Lunges", "station", 70],
  ["run_8", "Run 8", "run", 15],
  ["wall_balls", "Wall Balls", "station", 120],
];

function segment(segmentKey, label, type, gapSeconds, overrides = {}) {
  const target = type === "run" ? 300 : 120;
  return {
    segmentKey,
    label,
    type,
    userSeconds: target + gapSeconds,
    exactTargetSeconds: target,
    benchmarkMedianSeconds: target,
    goalBenchmarkSeconds: target,
    timeGapToMedianSeconds: gapSeconds,
    timeGapToExactTargetSeconds: gapSeconds,
    percentile: gapSeconds < 0 ? 80 : gapSeconds > 80 ? 20 : 45,
    fieldPercentile: gapSeconds < 0 ? 80 : gapSeconds > 80 ? 20 : 45,
    confidence: "high",
    ...overrides,
  };
}

function withoutDataUris(html) {
  return String(html).replace(/data:image\/[^;"']+;base64,[^"']+/g, "data:image;base64,");
}

function fixture(options = {}) {
  const segments = raceOrder.map(([key, label, type, gap]) => segment(key, label, type, gap));
  segments.push(
    segment("run_time", "Run Time", "aggregate", 120, { userSeconds: 2520, exactTargetSeconds: 2400 }),
    segment("work_time", "Work Time", "aggregate", 520, { userSeconds: 1780, exactTargetSeconds: 1260 }),
    segment("roxzone_time", "RoxZone Time", "aggregate", 40, { userSeconds: 220, exactTargetSeconds: 180 }),
    segment("total_time", "Total Time", "aggregate", 680, { userSeconds: 4520, exactTargetSeconds: 3840 }),
  );

  const benchmarkContext = {
    goalBenchmarkGroup: { label: "Target 64:00", targetFinishSeconds: 3840 },
    primaryBenchmarkGroup: { label: "Open Men 30-39" },
    achievedBand: "sub_80",
    ...(options.doubles ? { doublesBenchmarkedAsSingles: true } : {}),
  };
  const penalties = options.penalties
    ? [{ segmentKey: "run_5", penaltySeconds: 180, reason: "Wall ball reps" }]
    : [];
  const analysisJson = {
    submissionId: "11111111-1111-4111-8111-111111111111",
    race: { finishTimeSeconds: 4520 },
    athlete: { division: "open" },
    headline: {
      biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", timeGapSeconds: 120, percentile: 20 },
    },
    timePotential: { headlineGainSeconds: 120 },
    segments,
    penalties,
    benchmarkContext,
  };
  const personalReport = {
    sections: [
      { sectionKey: "cta", title: "Next Step", content: "Use Forma to build a training plan targeting your bottleneck." },
      ...(options.muscleGroup ? [{
        sectionKey: "muscle_group_profile",
        title: "Muscle Group Signal",
        content: [
          "Weakest stations: Wall Balls (+2:00), Sandbag Lunges (+1:10)",
          "Strongest station: Sled Pull (-0:20)",
          "Training focus: posterior-chain and wall-ball capacity.",
        ],
      }] : []),
      {
        sectionKey: "race_split_breakdown",
        title: "Race Split Breakdown",
        content: [],
        tableData: { segments, penalties, benchmarkContext },
      },
    ],
  };
  return buildEmailReport(
    personalReport,
    analysisJson,
    { displayName: "Alex Smith", finishTimeSeconds: 4520 },
    null,
    options.calculatorMode ?? "target",
  ).htmlBody;
}

test("email head contains Google Fonts import", () => {
  assert.match(fixture(), /fonts\.googleapis\.com/);
});

test("email contains getforma.fit in header and footer", () => {
  const html = fixture();
  assert.ok((html.match(/www\.getforma\.fit/g) ?? []).length >= 2);
});

test("email does not contain standalone forma.fit domain", () => {
  assert.doesNotMatch(fixture(), /(^|[^a-z])forma\.fit/i);
});

test("email does not contain getformai.com", () => {
  assert.doesNotMatch(fixture(), /getformai\.com/i);
});

test("email contains the new masthead tagline and not the old header subtitle", () => {
  const html = fixture();
  assert.doesNotMatch(html, /PERFORMANCE ENGINEER/);
  assert.match(html, /alt="Forma — Measure\. Understand\. Improve\."/);
});

test("email contains the inline Forma logo image", () => {
  const html = fixture();
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, />F<\/span>/);
});

test("hero uses dark navy background", () => {
  assert.match(fixture(), /background-color:#07111f;padding:28px 32px 24px 29px/);
});

test("hero headline uses light text", () => {
  assert.match(fixture(), /color:#f8fafc;line-height:1\.1/);
});

test("metric strip uses dark navy background", () => {
  assert.match(fixture(), /background-color:#07111f;border-top:1px solid rgba\(148,163,184,0\.12\);border-bottom:1px solid rgba\(148,163,184,0\.12\);padding:0/);
});

test("email shell and default cards stay on the dark theme", () => {
  const html = withoutDataUris(fixture());
  assert.match(html, /<body style="margin:0;padding:0;background-color:#07111f/);
  assert.doesNotMatch(html, /background-color:#ffffff/);
  assert.doesNotMatch(html, /background-color:#f0f4f8/);
});

test("email does not render pale semantic boxes", () => {
  const html = withoutDataUris(fixture({ doubles: true, penalties: true, muscleGroup: true }));
  const paleColors = [
    "background-color:#ffffff",
    "background-color:#f8fafc",
    "background-color:#f1f5f9",
    "background-color:#e2e8f0",
    "background-color:#e0f2fe",
    "background-color:#e8f7fd",
    "background-color:#f0f9ff",
    "background-color:#fffbeb",
    "background-color:#fef3c7",
    "background-color:#fffdf7",
    "background-color:#fee2e2",
    "background-color:#fff4f4",
    "background-color:#dcfce7",
    "background-color:#f0fdf4",
    "background-color:#f5f3ff",
    "background-color:#ede9fe",
    "border:1px solid #e2e8f0",
    "border:1px solid #fde68a",
    "border:1px solid #ddd6fe",
    "border:1px solid #bae6fd",
    "border:1px solid #bdeafb",
  ];
  for (const token of paleColors) {
    assert.ok(!html.includes(token), `Expected ${token} to be normalized to the dark email theme`);
  }
  assert.match(html, /background-color:#2a1f0b/);
  assert.match(html, /background-color:#2a1114/);
  assert.match(html, /background-color:#0f2a1c/);
  assert.match(html, /background-color:#1f1735/);
  assert.match(html, /background-color:#12263d/);
});

test("analyse CTA button uses Forma blue", () => {
  const html = fixture({ calculatorMode: "analyse" });
  assert.match(html, /Want to work towards a target time\?/);
  assert.match(html, /background-color:#0f6fff/);
  assert.doesNotMatch(html, /BUILD MY HYROX TRAINING PLAN/);
});

test("inline logo keeps email size below clipping risk", () => {
  const html = fixture({ doubles: true, penalties: true, muscleGroup: true });
  assert.ok(html.length < 120000, `Expected generated HTML below 120KB, got ${html.length}`);
});

test("old cyan accent is fully replaced", () => {
  assert.doesNotMatch(fixture(), /#08a7f5/);
});

test("split table includes RUN and STN tags", () => {
  const html = fixture();
  assert.match(html, />RUN</);
  assert.match(html, />STN</);
});
