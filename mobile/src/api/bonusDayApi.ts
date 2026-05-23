import { authPostJson } from "./client";

export type AddBonusDayBody = {
  focusType: string | null;
  programType: string;
  scope: "today" | "weekday_recurring";
  targetDate: string;
  weekday: string;
};

export type AddBonusDayResponse = {
  ok: boolean;
  programDayId: string;
  daysCreated: number;
};

export async function addBonusDay(
  programId: string,
  body: AddBonusDayBody,
): Promise<AddBonusDayResponse> {
  return authPostJson<AddBonusDayResponse, AddBonusDayBody>(
    `/api/programs/${encodeURIComponent(programId)}/bonus-day`,
    body,
  );
}
