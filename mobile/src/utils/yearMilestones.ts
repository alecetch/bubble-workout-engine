import type { YearMilestone } from "../api/yearProgress";

const priority = (slug: string): number => slug === "club_300" ? 5 : slug === "club_250" ? 4 : slug === "club_200" ? 3 : slug === "club_100" ? 1 : 2;
export function highestMilestone(rows: YearMilestone[]): YearMilestone | undefined {
  return [...rows].sort((a, b) => b.threshold - a.threshold || priority(b.slug) - priority(a.slug))[0];
}
