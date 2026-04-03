import type { EquipmentPreset } from "../state/onboarding/types";
import { getJson } from "./client";

export type EquipmentItemOption = {
  id: string;
  externalId: string | null;
  category: string | null;
  code: string;
  label: string;
};

export type EquipmentItemsForPresetResponse = {
  preset: string;
  items: EquipmentItemOption[];
};

export function getEquipmentItemsForPreset(preset: EquipmentPreset): Promise<EquipmentItemsForPresetResponse> {
  const encoded = encodeURIComponent(preset);
  return getJson<EquipmentItemsForPresetResponse>(`/equipment-items?preset=${encoded}`);
}
