import assert from "node:assert/strict";
import test from "node:test";
import { STATION_KEYS } from "../src/hyrox/config/segmentMap.js";
import { resolveHeroImage } from "../src/hyrox/reports/heroImageResolver.js";
import { buildTemplateA } from "../src/hyrox/reports/templateSlotMapper.js";

const BASE = "/assets/media-assets/hyrox-heroes";

const STATION_SLUG = {
  ski_erg: "ski-erg",
  sled_push: "sled-push",
  sled_pull: "sled-pull",
  burpee_broad_jump: "burpee-broad-jump",
  row: "row",
  farmers_carry: "farmers-carry",
  sandbag_lunges: "sandbag-lunges",
  wall_balls: "wall-balls",
};

const CATEGORY_SLUG = {
  running: "running",
  roxzone: "roxzone",
  pacing: "pacing",
  penalty: "penalty",
  data_quality: "data-quality",
};

function stationSegment(segmentKey, timeGapToMedianSeconds = 180) {
  return {
    segmentKey,
    label: segmentKey,
    type: "station",
    userSeconds: 480,
    benchmarkMedianSeconds: 300,
    timeGapToMedianSeconds,
    percentile: 25,
  };
}

function stationBreakdown(segmentKey, timeGapSeconds = 180) {
  return {
    segmentKey,
    label: segmentKey,
    confidence: "high",
    timeGapSeconds,
    percentile: 25,
  };
}

function stationCapacityAnalysis(segmentKey) {
  const supportKey = STATION_KEYS.find((key) => key !== segmentKey);
  return {
    analysisScope: "full",
    dataQuality: { confidence: "high" },
    race: { finishTimeSeconds: 5400 },
    segments: [
      stationSegment(segmentKey, 240),
      stationSegment(supportKey, 30),
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 10 },
      { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: 10 },
    ],
    stationBreakdown: [
      stationBreakdown(segmentKey, 240),
      stationBreakdown(supportKey, 30),
    ],
    limiters: [stationBreakdown(segmentKey, 240)],
    headline: {
      biggestLimiter: stationBreakdown(segmentKey, 240),
      biggestStrength: stationBreakdown("row", -30),
      headlineGainSeconds: 240,
    },
    timePotential: { headlineGainSeconds: 240 },
  };
}

function categoryAnalysis(category) {
  if (category === "running") {
    return {
      dataQuality: { confidence: "high" },
      segments: [
        { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 120 },
        { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: 90 },
      ],
      stationBreakdown: [],
      runningAnalysis: { runFadePct: 9 },
    };
  }

  if (category === "roxzone") {
    return {
      dataQuality: { confidence: "high" },
      segments: [],
      stationBreakdown: [],
      roxzoneAnalysis: { percentile: 20, timeGapToMedianSeconds: 120 },
    };
  }

  if (category === "pacing") {
    return {
      dataQuality: { confidence: "high" },
      segments: [
        { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 0 },
        { segmentKey: "run_2", type: "run", timeGapToMedianSeconds: 0 },
        { segmentKey: "ski_erg", type: "station", timeGapToMedianSeconds: 0 },
        { segmentKey: "sled_push", type: "station", timeGapToMedianSeconds: 0 },
      ],
      stationBreakdown: [],
      runningAnalysis: { runFadePct: 12 },
    };
  }

  if (category === "penalty") {
    return {
      dataQuality: { confidence: "high" },
      segments: [],
      stationBreakdown: [],
      penalties: [{ penaltySeconds: 180 }],
    };
  }

  return {
    dataQuality: { confidence: "low" },
    segments: [
      { segmentKey: "run_1", type: "run", timeGapToMedianSeconds: 0 },
      { segmentKey: "ski_erg", type: "station", timeGapToMedianSeconds: 0 },
    ],
    stationBreakdown: [],
  };
}

test("station capacity resolves all 8 male station hero images", () => {
  for (const key of STATION_KEYS) {
    assert.equal(
      resolveHeroImage(stationCapacityAnalysis(key), { sex: "male" }),
      `${BASE}/hyrox-${STATION_SLUG[key]}-male.png`,
    );
  }
});

test("station capacity resolves female station variants", () => {
  for (const key of ["sandbag_lunges", "wall_balls"]) {
    assert.equal(
      resolveHeroImage(stationCapacityAnalysis(key), { sex: "female" }),
      `${BASE}/hyrox-${STATION_SLUG[key]}-female.png`,
    );
  }
});

test("non-station categories resolve category hero images", () => {
  for (const category of ["running", "roxzone", "pacing", "penalty", "data_quality"]) {
    assert.equal(
      resolveHeroImage(categoryAnalysis(category), { sex: "male" }),
      `${BASE}/hyrox-${CATEGORY_SLUG[category]}-male.png`,
    );
  }
});

test("gender falls back to male for absent or unknown sex values", () => {
  for (const sex of [null, undefined, "unknown"]) {
    assert.match(resolveHeroImage(categoryAnalysis("running"), { sex }), /-male\.png$/);
  }
});

test("external athleteImage is preserved by Template A integration", () => {
  const athleteImage = "https://example.com/pro.jpg";
  const carousel = buildTemplateA(stationCapacityAnalysis("sandbag_lunges"), [], {
    athleteImage,
    sex: "female",
  });

  assert.equal(carousel.slides[0].athlete_image, athleteImage);
});

test("empty analysis does not throw when resolving hero image", () => {
  assert.doesNotThrow(() => resolveHeroImage({}));
  assert.match(resolveHeroImage({}), /^$|^\/assets\/media-assets\/hyrox-heroes\/hyrox-data-quality-male\.png$/);
});
