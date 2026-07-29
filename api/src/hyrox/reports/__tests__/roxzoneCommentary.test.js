import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoxzoneSection } from "../roxzoneCommentary.js";

function asArray(result) {
  return Array.isArray(result) ? result : [result];
}

describe("buildRoxzoneSection", () => {
  it("returns unavailable message when no data", () => {
    const result = buildRoxzoneSection({ roxzoneAnalysis: { available: false } });
    assert.match(asArray(result).join(" "), /no transition time data/i);
  });

  it("inferred_total, slow: includes percentile, gap, and tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 225, percentOfTotalTime: 0.04, percentile: 30, timeGapToMedianSeconds: 55 } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /3:45|4:00|225/);
    assert.match(lines, /30th|29th|31st/i);
    assert.match(lines, /55|0:55/);
    assert.match(lines, /Ways to cut transition time/i);
  });

  it("inferred_total, efficient: positive framing, no tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 150, percentOfTotalTime: 0.03, percentile: 62, timeGapToMedianSeconds: -15 } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /efficient/i);
    assert.equal(lines.includes("Ways to cut transition time"), false);
  });

  it("inferred_total, no percentile: shows fallback text and caveat", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 200, percentOfTotalTime: 0.035, percentile: null, timeGapToMedianSeconds: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /percentile comparison is not available/i);
    assert.match(lines, /estimated from unallocated/i);
  });

  it("explicit_splits, slow with worst transition >= 20s: calls out worst transition", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 280,
        percentOfTotalTime: 0.05,
        percentile: 25,
        timeGapToMedianSeconds: 80,
        worstTransition: { segmentKey: "roxzone_3", label: "Roxzone 3", timeGapToMedianSeconds: 22 },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /25th|24th|26th/i);
    assert.match(lines, /Roxzone 3/);
    assert.match(lines, /Ways to cut transition time/i);
  });

  it("explicit_total, understated: appends the RoxZone-may-be-understated caveat when a split was repaired", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_total",
        totalSeconds: 520,
        percentOfTotalTime: 0.09,
        percentile: 45,
        timeGapToMedianSeconds: 15,
        understated: true,
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /may also be understated/i);
  });

  it("explicit_total, not understated: no caveat when no split was repaired", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_total",
        totalSeconds: 520,
        percentOfTotalTime: 0.09,
        percentile: 45,
        timeGapToMedianSeconds: 15,
        understated: false,
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.doesNotMatch(lines, /may also be understated/i);
  });

  it("explicit_splits, efficient: positive framing, no tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "explicit_splits", totalSeconds: 140, percentOfTotalTime: 0.025, percentile: 72, timeGapToMedianSeconds: -20, worstTransition: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /efficient/i);
    assert.equal(lines.includes("Ways to cut transition time"), false);
  });

  it("explicit_splits, worst transition < 20s: tips shown but worst transition not called out", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 240,
        percentOfTotalTime: 0.04,
        percentile: 35,
        timeGapToMedianSeconds: 50,
        worstTransition: { segmentKey: "roxzone_5", label: "Roxzone 5", timeGapToMedianSeconds: 12 },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /Ways to cut transition time/i);
    assert.equal(lines.includes("Roxzone 5"), false);
  });

  it("returns array (not string) when tips are appended", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 240, percentOfTotalTime: 0.04, percentile: 28, timeGapToMedianSeconds: 60 } };
    const result = buildRoxzoneSection(analysis);
    assert.ok(Array.isArray(result), "Expected array when tips are appended");
  });

  it("percentOfTotalTime is shown as integer percent", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "explicit_splits", totalSeconds: 180, percentOfTotalTime: 0.05, percentile: 65, timeGapToMedianSeconds: -10, worstTransition: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /5%/);
  });

  it("includes race replay entry and exit detail when available", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "inferred_total",
        totalSeconds: 300,
        percentOfTotalTime: 0.06,
        percentile: 35,
        timeGapToMedianSeconds: 60,
        entryExitAvailable: true,
        entryTrend: "rising",
        stationOverhead: [
          { stationKey: "sandbag_lunges", entrySeconds: 61, exitSeconds: 78, totalSeconds: 139 },
        ],
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /combined \(/i);
    assert.match(lines, /Sandbag Lunges/);
    assert.match(lines, /2:19/);
    assert.match(lines, /progressively slower/i);
    assert.match(lines, /estimated from unallocated/i);
  });

  it("exit_led scenario: numeric detail matches the named exit station, with combined overhead shown separately when it differs", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 300,
        percentOfTotalTime: 0.05,
        entryExitAvailable: true,
        entryTrend: "stable",
        worstExit: { stationKey: "ski_erg", stationIndex: 1, seconds: 62 },
        worstEntry: { stationKey: "row", stationIndex: 5, seconds: 40 },
        stationOverhead: [
          { stationKey: "sandbag_lunges", entrySeconds: 49, exitSeconds: 48, totalSeconds: 97 },
        ],
        roxzoneNarrative: {
          available: true,
          scenarioTags: ["exit_led"],
          interpretationCopy: "Your longer RoxZone losses came after stations, especially after SkiErg. That usually points to recovery debt before you could get moving again.",
          actionCopy: "Practise finishing stations and jogging out under high breathing load. The goal is to reduce the recovery pause after the final rep.",
          caveatCopy: null,
          displayRows: [],
        },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /SkiErg exit: 1:02/);
    assert.match(lines, /Separately, your biggest combined entry\+exit overhead was at Sandbag Lunges/);
    assert.match(lines, /0:49 in, 0:48 out/);
  });

  it("exit_led scenario: no separate combined line when the named exit station is also the combined-overhead leader", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 300,
        percentOfTotalTime: 0.05,
        entryExitAvailable: true,
        entryTrend: "stable",
        worstExit: { stationKey: "ski_erg", stationIndex: 1, seconds: 62 },
        stationOverhead: [
          { stationKey: "ski_erg", entrySeconds: 20, exitSeconds: 62, totalSeconds: 82 },
        ],
        roxzoneNarrative: {
          available: true,
          scenarioTags: ["exit_led"],
          interpretationCopy: "Your longer RoxZone losses came after stations, especially after SkiErg.",
          actionCopy: "Practise finishing stations and jogging out under high breathing load.",
          caveatCopy: null,
          displayRows: [],
        },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /SkiErg exit: 1:02/);
    assert.equal(lines.includes("Separately"), false);
  });

  it("entry_led scenario: numeric detail matches the named entry station, with combined overhead shown separately when it differs", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 300,
        percentOfTotalTime: 0.05,
        entryExitAvailable: true,
        entryTrend: "stable",
        worstEntry: { stationKey: "wall_balls", stationIndex: 8, seconds: 58 },
        stationOverhead: [
          { stationKey: "sled_pull", entrySeconds: 45, exitSeconds: 40, totalSeconds: 85 },
        ],
        roxzoneNarrative: {
          available: true,
          scenarioTags: ["entry_led"],
          interpretationCopy: "Your bigger leakage came before starting stations, especially before Wall Balls. That points to setup, navigation or hesitation before the first rep.",
          actionCopy: "Use a simple station-entry script in training: enter, locate, hands on, first rep.",
          caveatCopy: null,
          displayRows: [],
        },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /Wall Balls entry: 0:58/);
    assert.match(lines, /Separately, your biggest combined entry\+exit overhead was at Sled Pull/);
  });

  it("suppresses station-level detail when entry/exit totals exceed total RoxZone time", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "inferred_total",
        totalSeconds: 615,
        percentOfTotalTime: 0.08,
        entryExitAvailable: true,
        worstEntry: { stationKey: "farmers_carry", stationIndex: 6, seconds: 637 },
        worstExit: { stationKey: "farmers_carry", stationIndex: 6, seconds: 909 },
        stationOverhead: [
          { stationKey: "farmers_carry", entrySeconds: 637, exitSeconds: 909, totalSeconds: 1546 },
        ],
      },
    };

    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");

    assert.match(lines, /RoxZone detail is partial or internally inconsistent/i);
    assert.doesNotMatch(lines, /25:46 combined/);
    assert.doesNotMatch(lines, /10:37 in/);
    assert.doesNotMatch(lines, /15:09 out/);
  });

  it("prepends on-benchmark note when frameGapSeconds is within threshold and narrative fires", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 307,
        percentOfTotalTime: 0.046,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 305,
          officialTotalSeconds: 307,
          roundingDifferenceSeconds: 2,
          summaryCopy: "Your Race Replay rows add up to 305s.",
          interpretationCopy: "Your longer RoxZone losses came after stations, especially after SkiErg.",
          actionCopy: "Practise finishing stations and jogging out under high breathing load.",
          caveatCopy: null,
          displayRows: [],
        },
      },
      segments: [{ segmentKey: "roxzone_time", frameGapSeconds: 9 }],
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /on benchmark/i);
    assert.match(lines, /detail below/i);
    assert.match(lines, /SkiErg/);
  });

  it("prepends on-target note in target mode when frameGapSeconds is within threshold", () => {
    const analysis = {
      calculatorMode: "target",
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 4800, label: "80:00 target" },
      },
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 307,
        percentOfTotalTime: 0.046,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 305,
          officialTotalSeconds: 307,
          roundingDifferenceSeconds: 2,
          summaryCopy: "Your Race Replay rows add up to 305s.",
          interpretationCopy: "Your longer RoxZone losses came after stations, especially after SkiErg.",
          actionCopy: "Practise finishing stations and jogging out under high breathing load.",
          caveatCopy: null,
          displayRows: [],
        },
      },
      segments: [{ segmentKey: "roxzone_time", frameGapSeconds: 9 }],
    };
    const lines = asArray(buildRoxzoneSection(analysis, { calculatorMode: "target" })).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /on target/i);
    assert.doesNotMatch(lines, /on benchmark/i);
    assert.match(lines, /detail below/i);
  });

  it("does not prepend on-benchmark note when frameGapSeconds exceeds threshold", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 420,
        percentOfTotalTime: 0.06,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 418,
          officialTotalSeconds: 420,
          roundingDifferenceSeconds: 2,
          summaryCopy: "Your Race Replay rows add up to 418s.",
          interpretationCopy: "Sandbag Lunges had the largest station overhead.",
          actionCopy: "Training cue: rehearse leaving Sandbag Lunges immediately.",
          caveatCopy: null,
          displayRows: [],
        },
      },
      segments: [{ segmentKey: "roxzone_time", frameGapSeconds: 95 }],
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.doesNotMatch(lines, /on benchmark/i);
    assert.doesNotMatch(lines, /detail below/i);
  });

  it("prepends ahead-of-benchmark note when frameGapSeconds is negative and within threshold", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 280,
        percentOfTotalTime: 0.04,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 279,
          officialTotalSeconds: 280,
          roundingDifferenceSeconds: 1,
          summaryCopy: "Your Race Replay rows add up to 279s.",
          interpretationCopy: "Your RoxZone execution was controlled.",
          actionCopy: "Keep transition practice late in longer sessions.",
          caveatCopy: null,
          displayRows: [],
        },
      },
      segments: [{ segmentKey: "roxzone_time", frameGapSeconds: -15 }],
    };
    const lines = asArray(buildRoxzoneSection(analysis)).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /ahead of the benchmark/i);
    assert.match(lines, /did not cost you time/i);
  });

  it("prepends ahead-of-target note in target mode when frameGapSeconds is negative and within threshold", () => {
    const analysis = {
      calculatorMode: "target",
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 4800, label: "80:00 target" },
      },
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 280,
        percentOfTotalTime: 0.04,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 279,
          officialTotalSeconds: 280,
          roundingDifferenceSeconds: 1,
          summaryCopy: "Your Race Replay rows add up to 279s.",
          interpretationCopy: "Your RoxZone execution was controlled.",
          actionCopy: "Keep transition practice late in longer sessions.",
          caveatCopy: null,
          displayRows: [],
        },
      },
      segments: [{ segmentKey: "roxzone_time", frameGapSeconds: -15 }],
    };
    const lines = asArray(buildRoxzoneSection(analysis, { calculatorMode: "target" })).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /ahead of target/i);
    assert.doesNotMatch(lines, /ahead of the benchmark/i);
    assert.match(lines, /did not cost you time/i);
  });

  it("uses roxzone narrative copy and rounded checkpoint caveat when available", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "inferred_total",
        totalSeconds: 273,
        percentOfTotalTime: 0.056,
        roxzoneNarrative: {
          available: true,
          replayTotalSeconds: 271,
          officialTotalSeconds: 273,
          roundingDifferenceSeconds: 2,
          summaryCopy: "Your Race Replay rows add up to 271s of measurable RoxZone time, versus 273s officially.",
          interpretationCopy: "The biggest RoxZone story is around Sandbag Lunges.",
          actionCopy: "Prioritise compromised Sandbag Lunges practice.",
          caveatCopy: "Race Replay checkpoint rows are rounded before summing, so the station-by-station total may differ by a few seconds from the official RoxZone total.",
          displayRows: [],
        },
      },
    };
    const result = buildRoxzoneSection(analysis);
    const lines = asArray(result).filter((item) => typeof item === "string").join("\n");
    assert.match(lines, /Sandbag Lunges/);
    assert.match(lines, /rounded before summing/i);
    assert.ok(asArray(result).some((item) => item?.__type === "roxzone_narrative"));
  });
});
