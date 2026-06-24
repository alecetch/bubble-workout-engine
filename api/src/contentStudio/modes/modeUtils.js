import { stationLabel } from "../utils.js";

export const BRAND = { product: "FORMA", site: "forma.fit" };
export const STATION_KEYS = ["skierg", "sled_push", "sled_pull", "burpee_bj", "row", "farmers_carry", "sandbag_lunge", "wall_balls"];
export const ALL_SEGMENTS = ["run_1", "skierg", "run_2", "sled_push", "run_3", "sled_pull", "run_4", "burpee_bj", "run_5", "row", "run_6", "farmers_carry", "run_7", "sandbag_lunge", "run_8", "wall_balls"];

export function findAthlete(raceAnalysis, name) {
  const needle = String(name ?? "").trim().toLowerCase();
  if (!needle) return null;
  return raceAnalysis.athletes.find((athlete) => {
    const athleteName = athlete.name.toLowerCase();
    return athleteName.includes(needle) || needle.includes(athleteName);
  }) ?? null;
}

export function resolveHandle(name, athleteRegistry = []) {
  return athleteRegistry.find((athlete) => athlete.full_name?.toLowerCase() === String(name).toLowerCase())?.instagram_handle ?? null;
}

export function archetypeLabel(athlete, n) {
  if (athlete.runRank == null || athlete.stationRank == null || n < 2) return "Balanced hybrid";
  // Use fractional position (0 = top, 1 = bottom); positive diff means better at stations
  const runFrac = athlete.runRank / n;
  const statFrac = athlete.stationRank / n;
  const diff = runFrac - statFrac;
  if (diff < -0.2) return "Running dominant";
  if (diff > 0.2) return "Station dominant";
  return "Balanced hybrid";
}

export function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function updateSlideTotals(slides) {
  return slides.map((slide, index) => ({ ...slide, slideIndex: index + 1, totalSlides: slides.length }));
}

export function stationMetricLabel(key) {
  return key?.startsWith("run_") ? key.replace("_", " ").toUpperCase() : stationLabel(key);
}
