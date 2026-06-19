import { selectPrimaryCategory } from "../interpretation/hyroxInterpretationEngine.js";
import { STATION_KEYS } from "../config/segmentMap.js";

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

function normaliseGender(sex) {
  if (sex === "female" || sex === "f") return "female";
  return "male";
}

function limiterKey(analysisJson) {
  return [...(analysisJson.segments ?? [])]
    .filter((s) => STATION_KEYS.includes(s.segmentKey) && Number(s.timeGapToMedianSeconds) > 0)
    .sort((a, b) => b.timeGapToMedianSeconds - a.timeGapToMedianSeconds)[0]
    ?.segmentKey
    ?? analysisJson.limiters?.[0]?.segmentKey
    ?? null;
}

export function resolveHeroImage(analysisJson = {}, athleteContext = {}) {
  const gender = normaliseGender(athleteContext.sex);
  const category = selectPrimaryCategory(analysisJson);

  if (category === "station_capacity") {
    const key = limiterKey(analysisJson);
    const slug = STATION_SLUG[key];
    if (slug) return `${BASE}/hyrox-${slug}-${gender}.png`;
  }

  const slug = CATEGORY_SLUG[category];
  if (slug) return `${BASE}/hyrox-${slug}-${gender}.png`;

  return "";
}
