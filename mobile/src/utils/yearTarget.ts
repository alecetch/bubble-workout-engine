const DAY_MS = 86_400_000;
const BASE_TARGET = 200;

function remainingYear(joinLocalDate: string) {
  const instant = Date.parse(`${joinLocalDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinLocalDate) || !Number.isFinite(instant)
    || new Date(instant).toISOString().slice(0, 10) !== joinLocalDate) {
    throw new RangeError("Expected a valid local date in YYYY-MM-DD format.");
  }
  const year = Number(joinLocalDate.slice(0, 4));
  const start = new Date(instant);
  start.setUTCMonth(0, 1);
  const end = new Date(start);
  end.setUTCFullYear(year + 1);
  return { year, days: (end.getTime() - start.getTime()) / DAY_MS, remaining: (end.getTime() - instant) / DAY_MS };
}

export function firstYearTarget(joinLocalDate: string): { year: number; target: number; proRated: boolean } {
  const { year, days, remaining } = remainingYear(joinLocalDate);
  return { year, target: Math.round(BASE_TARGET * remaining / days), proRated: remaining < days };
}

export function projectedDays(daysPerWeek: number, fromLocalDate?: string): number {
  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 0 || daysPerWeek > 7) {
    throw new RangeError("Days per week must be between zero and seven.");
  }
  return Math.round(daysPerWeek * (fromLocalDate === undefined ? 52 : remainingYear(fromLocalDate).remaining / 7));
}
