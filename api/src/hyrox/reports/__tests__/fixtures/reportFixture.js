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

export function reportFixture(options = {}) {
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
      { sectionKey: "cta", title: "Next Step", content: "Use the training app to build a training plan targeting your bottleneck." },
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
  return [
    personalReport,
    analysisJson,
    { displayName: "Alex Smith", finishTimeSeconds: 4520 },
    null,
    options.calculatorMode ?? "target",
  ];
}
