export const CURATED_HERO_DAY_TYPES = new Set(["conditioning", "hyrox", "simulation", "recovery"]);
export const HERO_SEGMENT_TYPES = new Set(["single", "superset", "strength"]);

export function resolveExerciseLedHero({ dayType, weekNumber, items }) {
  if (CURATED_HERO_DAY_TYPES.has(dayType)) return null;

  const ordered = [...items].sort((a, b) => a.order_in_day - b.order_in_day);
  const seen = new Set();
  const candidates = [];
  for (const purpose of ["main", "secondary"]) {
    for (const item of ordered) {
      if (item.purpose !== purpose || !HERO_SEGMENT_TYPES.has(item.segment_type)
        || item.still_image_is_placeholder !== false || seen.has(item.exercise_id)
        || !item.exercise_id || !(item.stillCardUrl || item.stillImageUrl)
        || /(?:^|\/)_placeholder(?:\/|$)/.test(item.still_image_key || item.stillImageUrl || "")) continue;
      seen.add(item.exercise_id);
      candidates.push(item);
    }
  }
  if (!candidates.length) return null;

  const number = Number(weekNumber);
  const week = Math.max(Number.isFinite(number) ? Math.floor(number) : 1, 1);
  const item = candidates[(week - 1) % candidates.length];
  return {
    exercise_id: item.exercise_id,
    exercise_name: item.exercise_name,
    url: item.stillCardUrl || item.stillImageUrl,
    thumbhash: item.stillThumbhash ?? null,
  };
}
