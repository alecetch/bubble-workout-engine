import { useRef } from "react";
import { useClientProfile } from "../../api/hooks";

export function useProfileEditBaseline(profileId: string, enabled: boolean) {
  const profileQuery = useClientProfile(enabled ? profileId : null);
  const snapshot = useRef<{
    preset: string | null; items: string[]; dayCount: number;
  } | null>(null);
  if (!snapshot.current && profileQuery.data) {
    const profile = profileQuery.data;
    snapshot.current = {
      preset: profile.equipmentPresetCode ?? profile.equipmentPreset ?? null,
      items: [...(profile.selectedEquipmentCodes ?? profile.equipmentItemCodes ?? [])],
      dayCount: profile.preferredDays?.length ?? 0,
    };
  }
  return snapshot.current;
}
