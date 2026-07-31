import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHyroxReportContract } from "../reportContractBuilder.js";

function baseAnalysis(overrides = {}) {
  return {
    analysisScope: "full",
    calculatorMode: "target",
    race: { finishTimeSeconds: 4500, targetTimeSeconds: 4200 },
    dataQuality: { warnings: [], issues: [], inputCompleteness: 1, confidence: "high" },
    benchmarkContext: {
      primaryBenchmarkGroup: { label: "Open Male", key: "open_male", sampleSize: 1000 },
      goalBenchmarkGroup: { label: "sub-70", targetFinishSeconds: 4200 },
      comparisonOptions: {
        options: [{ id: "global", label: "Global Open Male", percentile: 72, topPercent: 28 }],
      },
    },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
      biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 82 },
    },
    timePotential: { headlineGainSeconds: 90 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4500, frameGapSeconds: 300, percentile: 72, fieldPercentile: 72 },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, timeGapSeconds: 90, percentile: 35, confidence: "high" },
      { segmentKey: "farmers_carry", type: "station", label: "Farmers Carry", userSeconds: 120, frameGapSeconds: -30, timeGapToMedianSeconds: -30, percentile: 82, confidence: "high" },
      { segmentKey: "run_8", type: "run", label: "Run 8", userSeconds: 330, frameGapSeconds: 80, timeGapSeconds: 80, percentile: 40, confidence: "high" },
      { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 300, frameGapSeconds: 30, timeGapSeconds: 30, percentile: 45, confidence: "high" },
    ],
    strengths: [{ segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", userSeconds: 120, frameGapSeconds: -30, percentile: 82 }],
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 }],
    penalties: [],
    ...overrides,
  };
}

describe("buildHyroxReportContract", () => {
  it("builds a firm station primary with rank display when percentile and basis exist", () => {
    const contract = buildHyroxReportContract({ analysisJson: baseAnalysis(), athleteContext: { displayName: "Alex" } });

    assert.equal(contract.primaryClaim.normalizedLabel, "Wall Balls");
    assert.equal(contract.primaryClaim.claimStrength, "firm");
    assert.equal(contract.primaryClaim.compactLabel, "BIGGEST LIMITER");
    assert.equal(contract.rankPolicy.allowed, true);
    assert.equal(contract.rankPolicy.displays[0].basisLabel, "Global Open Male");
  });

  it("exposes doubles team context and team-aware email main insight slots", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        athlete: { division: "doubles_mixed" },
        race: { finishTimeSeconds: 4500, targetTimeSeconds: 4200, division: "doubles_mixed" },
      }),
      athleteContext: { displayName: "Alex Smith & Sam Jones", division: "doubles_mixed" },
    });

    assert.equal(contract.inputFacts.isDoubles, true);
    assert.equal(contract.teamContext.opportunityOwner, "your team's");
    assert.match(contract.artifactSlots.email.mainInsightOpening, /main team target opportunity/i);
    assert.match(contract.artifactSlots.email.mainInsightOpening, /combined team time/i);
  });

  it("makes penalties primary only in penalty-first mode", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        penalties: [{ runKey: "run_2", penaltySeconds: 420 }],
      }),
    });

    assert.equal(contract.headlineMode, "penalty_first");
    assert.equal(contract.primaryClaim.normalizedLabel, "Penalties");
    assert.equal(contract.primaryClaim.compactLabel, "FASTEST CONTROLLABLE WIN");
    assert.ok(contract.secondaryClaims.some((claim) => claim.normalizedLabel === "Wall Balls"));
  });

  it("suppresses rank claims for no-benchmark reports even with athlete percentile context", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        analysisScope: "no_benchmark_data",
        benchmarkContext: { available: false, primaryBenchmarkGroup: null, comparisonOptions: { options: [] } },
        dataQuality: { warnings: [], issues: ["no_benchmark_data"], inputCompleteness: 1 },
      }),
      athleteContext: { overallPercentile: 99 },
    });

    assert.equal(contract.rankPolicy.allowed, false);
    assert.equal(contract.rankPolicy.reason, "no_benchmark_data");
    assert.equal(contract.primaryClaim.claimStrength, "directional");
    assert.deepEqual(contract.rankPolicy.displays, []);
  });

  it("downgrades partial split data to directional compact labels", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        dataQuality: { warnings: ["partial_split_data"], issues: [], inputCompleteness: 0.8 },
      }),
    });

    assert.equal(contract.primaryClaim.claimStrength, "directional");
    assert.equal(contract.primaryClaim.compactLabel, "DIRECTIONAL OPPORTUNITY");
    assert.match(contract.dataQualityPolicy.longCaveat, /missing/i);
  });

  it("marks missing run total as missing-run policy", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        headline: { biggestLimiter: { segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 120 } },
        limiters: [{ segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 120 }],
        dataQuality: { warnings: ["missing_run_total"], issues: [], inputCompleteness: 1 },
      }),
    });

    assert.equal(contract.dataQualityPolicy.missingRunData, true);
    assert.equal(contract.primaryClaim.claimStrength, "directional");
  });

  it("marks inferred RoxZone primary as directional", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        headline: { biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 140 } },
        limiters: [{ segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 140 }],
        roxzoneAnalysis: { mode: "inferred_total" },
        dataQuality: { warnings: ["roxzone_inferred_from_unallocated_time"], issues: [], inputCompleteness: 1 },
      }),
    });

    assert.equal(contract.dataQualityPolicy.inferredRoxzone, true);
    assert.equal(contract.primaryClaim.normalizedLabel, "RoxZone");
    assert.equal(contract.primaryClaim.claimStrength, "directional");
  });

  it("suppresses firm claims on anomaly warnings", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        dataQuality: { warnings: ["unreconciled_total_anomaly"], issues: [], inputCompleteness: 0.9 },
      }),
    });

    assert.equal(contract.primaryClaim.claimStrength, "suppressed");
    assert.equal(contract.primaryClaim.compactLabel, "INSUFFICIENT SPLIT CONFIDENCE");
    assert.equal(contract.rankPolicy.allowed, false);
  });

  it("exposes resolved v2 sections and artifact slots", () => {
    const contract = buildHyroxReportContract({ analysisJson: baseAnalysis() });

    assert.ok(contract.inputFacts);
    assert.ok(contract.comparisonFrame);
    assert.ok(contract.primaryTrack);
    assert.ok(contract.targetAssessment);
    assert.ok(contract.gapReconciliation);
    assert.ok(contract.splitProfile);
    assert.ok(contract.strengthPolicy);
    assert.ok(contract.roxzonePolicy);
    assert.ok(contract.artifactSlots);
    assert.equal(contract.artifactSlots.email.subjectPrimary, "Wall Balls");
    assert.equal(contract.artifactSlots.raceCard.heroPrimary, "Wall Balls");
    assert.equal(contract.artifactSlots.carousel.ctaHeadline, contract.targetAssessment.ctaHeadline);
  });

  it("uses exact target gap magnitude to suppress marginal-gain CTA", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        race: { finishTimeSeconds: 4887, targetTimeSeconds: 4500 },
        benchmarkContext: {
          ...baseAnalysis().benchmarkContext,
          achievedBand: "sub_60",
          goalBenchmarkGroup: { label: "sub-75", targetFinishSeconds: 4500 },
        },
        segments: baseAnalysis().segments.map((row) => row.segmentKey === "total_time" ? { ...row, userSeconds: 4887, frameGapSeconds: 387 } : row),
      }),
    });

    assert.equal(contract.targetAssessment.status, "behind");
    assert.equal(contract.targetAssessment.gapMagnitude, "large");
    assert.equal(contract.targetAssessment.ctaHeadline, "FIND YOUR TARGET ROUTE");
  });

  it("requires offset wording when category gaps exceed the total gap", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4500, frameGapSeconds: 120, percentile: 72 },
          { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1900, frameGapSeconds: 240, percentile: 30 },
          { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2200, frameGapSeconds: -150, percentile: 90 },
          { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, percentile: 35 },
        ],
      }),
    });

    assert.equal(contract.gapReconciliation.requiresOffsetWording, true);
    assert.match(contract.gapReconciliation.summarySentence, /offset/i);
  });

  it("adds the benchmark-band median lens to analyse-mode offset reconciliation", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        calculatorMode: "analyse",
        benchmarkContext: {
          ...baseAnalysis().benchmarkContext,
          analysisFrame: { comparisonBand: "sub_75" },
        },
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4500, frameGapSeconds: 63, percentile: 72 },
          { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1900, frameGapSeconds: 89, percentile: 30 },
          { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2200, frameGapSeconds: -90, percentile: 90 },
          { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 300, frameGapSeconds: 64, percentile: 45 },
          { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, percentile: 35 },
        ],
      }),
    });

    assert.match(contract.artifactSlots.email.mainInsightOpening, /total gap is \+1:03 lower than the median for 70:00–74:59 finishers/i);
  });

  it("adds the selected target lens to target-mode offset reconciliation", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        calculatorMode: "target",
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4500, frameGapSeconds: 63, percentile: 72 },
          { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1900, frameGapSeconds: 89, percentile: 30 },
          { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2200, frameGapSeconds: -90, percentile: 90 },
          { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 300, frameGapSeconds: 64, percentile: 45 },
          { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, percentile: 35 },
        ],
      }),
    });

    assert.match(contract.artifactSlots.email.mainInsightOpening, /total gap is \+1:03 lower than your target finish time/i);
  });

  it("distinguishes fastest-ahead split from reliable protectable strength", () => {
    const analysisJson = baseAnalysis({
      headline: { biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90 }, biggestStrength: null },
      strengths: [],
    });
    const contract = buildHyroxReportContract({ analysisJson });

    assert.equal(contract.strengthPolicy.status, "fastest_ahead_split_only");
    assert.equal(contract.strengthPolicy.displayLabel, "Farmers Carry");
    assert.match(contract.strengthPolicy.explanation, /no protectable strength/i);
  });

  it("sets directional RoxZone copy precision for inferred transition data", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        headline: { biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 140 } },
        limiters: [{ segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 140 }],
        roxzoneAnalysis: { mode: "inferred_total" },
        dataQuality: { warnings: ["roxzone_inferred_from_unallocated_time"], issues: [], inputCompleteness: 1 },
      }),
    });

    assert.equal(contract.roxzonePolicy.copyPrecision, "directional");
    assert.ok(contract.roxzonePolicy.requiredCaveat);
  });

  it("preserves canonical run label casing in artifact slots", () => {
    const contract = buildHyroxReportContract({
      analysisJson: baseAnalysis({
        headline: { biggestLimiter: { segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 120 } },
        limiters: [{ segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 120 }],
      }),
    });

    assert.equal(contract.primaryClaim.label, "Run 8");
    assert.match(contract.artifactSlots.email.mainInsightOpening, /Run 8/);
    assert.doesNotMatch(contract.artifactSlots.email.mainInsightOpening, /run 8/);
  });
});
