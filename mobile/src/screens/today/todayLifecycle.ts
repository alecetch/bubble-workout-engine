import type { ProgramDayStatus } from "../../components/program/CalendarDayPillRow";

export type TodayLifecycleState =
  | "no_program"
  | "today_scheduled"
  | "today_complete"
  | "today_rest"
  | "program_complete";

export function computeLifecycleState(params: {
  resolvedProgramId: string | null;
  calendarDays: Array<{
    calendarDate?: string | null;
    isTrainingDay?: boolean;
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

  return "today_rest";
}
