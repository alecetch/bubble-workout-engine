import { getJson } from "./client";

export type GoalTypeOption = {
  code: string;
  label: string;
};

export type EquipmentPresetOption = {
  code: string;
  label: string;
};

export type FitnessLevelOption = {
  rank: number;
  code: string;
  label: string;
};

export type InjuryFlagOption = {
  code: string;
  label: string;
};

export type MinutesOption = {
  minutes: number;
  label: string;
};

export type DayOfWeekOption = {
  code: string;
  label: string;
};

export type SexOption = {
  code: string;
  label: string;
};

export type AgeRangeOption = {
  code: string;
  label: string;
  isAdult: boolean;
};

export type ReferenceDataResponse = {
  goalTypes: GoalTypeOption[];
  equipmentPresets: EquipmentPresetOption[];
  fitnessLevels: FitnessLevelOption[];
  injuryFlags: InjuryFlagOption[];
  minutesOptions: MinutesOption[];
  daysOfWeek: DayOfWeekOption[];
  sexOptions: SexOption[];
  ageRanges: AgeRangeOption[];
};

export function getReferenceData(): Promise<ReferenceDataResponse> {
  return getJson<ReferenceDataResponse>("/reference-data");
}
