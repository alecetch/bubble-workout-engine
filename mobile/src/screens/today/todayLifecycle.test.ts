import { describe, expect, it } from "vitest";
import { mergeDayStatuses, computeLifecycleState } from "./todayLifecycle";
import type { ProgramDayStatus } from "../../components/program/CalendarDayPillRow";
const day = (date: string, id = "day") => ({ calendarDate: date, programDayId: id, isTrainingDay: true });
const state = (calendarDays: ReturnType<typeof day>[], statuses: Record<string, ProgramDayStatus> = {}, todayIso = "2026-05-01") => computeLifecycleState({ resolvedProgramId: "program", calendarDays, dayStatusByProgramDayId: statuses, todayIso });
describe("Today block lifecycle", () => {
  it("ends an incomplete block only from the second day after its last date", () => {
    expect(state([day("2026-04-29")])).toBe("block_ended");
    expect(state([day("2026-04-30")])).toBe("today_rest");
  });
  it("keeps complete blocks and scheduled/started/complete today states", () => {
    expect(state([day("2026-04-01")], { day: "complete" })).toBe("program_complete");
    expect(state([day("2026-05-01")])).toBe("today_scheduled");
    expect(state([day("2026-05-01")], { day: "started" })).toBe("today_started");
    expect(state([day("2026-05-01")], { day: "complete" })).toBe("today_complete");
  });
  it("does not end blocks with future sessions or unknown dates", () => {
    expect(state([day("2026-04-01"), day("2026-05-02", "future")])).toBe("today_rest");
    expect(state([day("")])).toBe("today_rest");
    expect(state([])).toBe("today_rest");
  });
  it("handles leap days and year boundaries without local DST arithmetic", () => {
    expect(state([day("2024-02-28")], {}, "2024-03-01")).toBe("block_ended");
    expect(state([day("2025-12-31")], {}, "2026-01-01")).toBe("today_rest");
    expect(state([day("2025-12-31")], {}, "2026-01-02")).toBe("block_ended");
  });
  it("ignores skipped dates when determining the ended schedule", () => {
    const result = computeLifecycleState({ resolvedProgramId: "p", todayIso: "2026-05-01", dayStatusByProgramDayId: {},
      calendarDays: [day("2026-04-01"), { ...day("2026-06-01", "skip"), isSkipped: true }] });
    expect(result).toBe("block_ended");
  });
  it("keeps no-program behavior", () => {
    expect(computeLifecycleState({ resolvedProgramId: null, calendarDays: [day("2026-04-01")], dayStatusByProgramDayId: {}, todayIso: "2026-05-01" })).toBe("no_program");
  });
});

for (const [local,server,expected] of [["scheduled","complete","complete"],["complete","scheduled","complete"],["started","scheduled","started"]] as const)
 it(`reconciles local ${local} with server ${server}`,()=>{
   const calendar=[{...day("2026-05-01"),status:server}];const original={day:local};
   const merged=mergeDayStatuses(original,calendar);expect(merged.day).toBe(expected);expect(original.day).toBe(local);
   expect(state(calendar,merged)).toBe(expected === "complete" ? "today_complete" : "today_started");
 });
