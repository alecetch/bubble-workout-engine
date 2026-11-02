import type { YearProgressResponse } from "../api/yearProgress";

type Pace = Pick<YearProgressResponse, "pace_status" | "pace_delta" | "projected_year_end">;
const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export function paceLine(p: Pace): string {
  if (p.pace_status === "ahead") return `${Math.floor(p.pace_delta)} ahead · on track for ~${p.projected_year_end}`;
  if (p.pace_status === "on_pace") return `On pace · on track for ~${p.projected_year_end}`;
  const needed = Math.ceil(-p.pace_delta);
  const action = needed === 1 ? "one extra session this week" : `${numberWords[needed] ?? needed} extra sessions this fortnight`;
  return `${needed} behind · ${action} closes it`;
}

export function summaryCountCopy(countAfterSession: number, target: number, year: number): string {
  const lead = `That's ${countAfterSession}.`;
  if (countAfterSession < target) return `${lead} ${target - countAfterSession} to go.`;
  if (countAfterSession === target) return `${lead} You're in for ${year}.`;
  const nextClub = [100, 200, 250, 300].find(tier => tier > countAfterSession);
  return nextClub ? `${lead} Club ${nextClub} is ${nextClub - countAfterSession} away.` : `${lead} Club 300 — elite year.`;
}

export function restDayCopy(p: Pick<Pace, "pace_delta" | "pace_status">): string {
  if (p.pace_status === "behind" && p.pace_delta <= -1) return `You're ${Math.ceil(-p.pace_delta)} behind. A bonus session today closes the gap.`;
  return p.pace_status === "ahead" ? "You're ahead. Rest is training too." : "On pace. Rest is training too.";
}

export function doneCopy(count: number): string {
  return `Day ${count} is in.`;
}

export function proRatedNote(p: Pick<YearProgressResponse, "pro_rated" | "year" | "target">): string | null {
  return p.pro_rated ? `Your ${p.year} target: ${p.target} days. Next year it's 200.` : null;
}
