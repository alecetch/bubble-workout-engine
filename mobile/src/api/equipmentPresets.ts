import type { EquipmentPreset } from "../state/onboarding/types";
import { getJson } from "./client";

export type EquipmentItemOption = {
  code: string;
  label: string;
};

export function getEquipmentItemsForPreset(preset: EquipmentPreset): Promise<EquipmentItemOption[]> {
  const encoded = encodeURIComponent(preset);
  return getJson<EquipmentItemOption[]>(`/equipment-presets/${encoded}/items`);
}
