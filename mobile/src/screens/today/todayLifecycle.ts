import type { ProgramDayStatus } from "../../components/program/CalendarDayPillRow";

export type TodayLifecycleState =
  | "no_program"
  | "today_scheduled"
  | "today_started"
  | "today_complete"
  | "block_ended"
  | "today_rest"
  | "program_complete";

export function computeLifecycleState(params: {
  resolvedProgramId: string | null;
  calendarDays: Array<{
    calendarDate?: string | null;
    isTrainingDay?: boolean;
    isSkipped?: boolean | null;
    programDayId?: string | null;
  }>;
  dayStatusByProgramDayId: Record<string, ProgramDayStatus>;
  todayIso: string;
}): TodayLifecycleState {
  const { resolvedProgramId, calendarDays, dayStatusByProgramDayId, todayIso } = params;

  if (!resolvedProgramId) return "no_program";

  const allTrainingDays = calendarDays.filter(
    (d) => d.isTrainingDay && d.programDayId,
  );

  const todayTrainingDay = allTrainingDays.find(
    (d) => d.calendarDate === todayIso,
  );

  if (todayTrainingDay?.programDayId) {
    const status = dayStatusByProgramDayId[todayTrainingDay.programDayId] ?? "scheduled";
    if (status === "complete") return "today_complete";
    if (status === "started") return "today_started";
    return "today_scheduled";
  }

  if (
    allTrainingDays.length > 0 &&
    allTrainingDays.every(
      (d) => dayStatusByProgramDayId[d.programDayId!] === "complete",
    )
  ) {
    return "program_complete";
  }

  const yesterday = new Date(`${todayIso}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const cutoff = yesterday.toISOString().slice(0, 10);
  const scheduled = allTrainingDays.filter(day => !day.isSkipped && dayStatusByProgramDayId[day.programDayId!] !== "skipped");
  if (scheduled.length > 0 && scheduled.some(day => dayStatusByProgramDayId[day.programDayId!] !== "complete") &&
    scheduled.every(day => Boolean(day.calendarDate) && day.calendarDate! < cutoff)) return "block_ended";

  return "today_rest";
}
