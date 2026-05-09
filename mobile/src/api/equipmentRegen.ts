import { authGetJson, authPostJson } from "./client";

export type ProgramEquipmentState = {
  profileDefault: {
    equipmentPresetSlug: string | null;
    equipmentItemSlugs: string[];
  };
  futureDays: Array<{
    programDayId: string;
    scheduledDate: string;
    scheduledWeekday: string;
    weekNumber: number;
    equipmentOverridePresetSlug: string | null;
    equipmentOverrideItemSlugs: string[] | null;
  }>;
};

export type RegenerateDaysResult = {
  regenerated: number;
  skipped: number;
  partiallyLogged: number;
  dayIds: string[];
};

export async function getProgramEquipment(programId: string): Promise<ProgramEquipmentState> {
  return authGetJson<ProgramEquipmentState>(`/api/program/${programId}/equipment`);
}

export async function regenerateProgramDays(
  programId: string,
  payload: {
    dayIds: string[];
    equipmentPresetSlug: string | null;
    equipmentItemSlugs: string[];
  },
): Promise<RegenerateDaysResult> {
  return authPostJson<RegenerateDaysResult, typeof payload>(
    `/api/program/${programId}/regenerate-days`,
    payload,
  );
}
