import type {
  AgeRange,
  EquipmentPreset,
  FitnessLevel,
  GoalType,
  InjuryFlag,
  Sex,
} from "../state/onboarding/types";
import { getJson } from "./client";

export type ReferenceDataResponse = {
  goalTypes: GoalType[];
  fitnessLevels: FitnessLevel[];
  injuryFlags: InjuryFlag[];
  minutesOptions: number[];
  sexOptions: Sex[];
  ageRanges: AgeRange[];
  equipmentPresets: EquipmentPreset[];
};

export function getReferenceData(): Promise<ReferenceDataResponse> {
  return getJson<ReferenceDataResponse>("/reference-data");
}
