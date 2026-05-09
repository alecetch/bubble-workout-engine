import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  useActivePrograms,
  useClientProfile,
  useEquipmentItems,
  useMe,
  useReferenceData,
  useRegenerateDays,
  useUpdateClientProfile,
} from "../../api/hooks";
import { getProgramEquipment } from "../../api/equipmentRegen";
import { EquipmentCategorySection } from "../../components/onboarding/EquipmentCategorySection";
import { PresetCardList } from "../../components/onboarding/PresetCardList";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { SettingsStackParamList } from "../../navigation/SettingsStackNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";

type Props = NativeStackScreenProps<SettingsStackParamList, "EquipmentSettings">;

type EquipmentCatalogItem = {
  code: string;
  label: string;
  category: string | null;
};

function dedupeEquipmentItems(items: EquipmentCatalogItem[]): EquipmentCatalogItem[] {
  const byCode = new Map<string, EquipmentCatalogItem>();
  items.forEach((item) => {
    const existing = byCode.get(item.code);
    if (!existing) {
      byCode.set(item.code, item);
      return;
    }
    byCode.set(item.code, {
      code: existing.code,
      label: existing.label || item.label,
      category: existing.category ?? item.category,
    });
  });
  return Array.from(byCode.values());
}

function normalizeCodes(values: string[]): string[] {
  return [...values].map((value) => value.trim()).filter(Boolean).sort();
}

export function EquipmentSettingsScreen({ navigation }: Props): React.JSX.Element {
  const meQuery = useMe();
  const activeProgramsQuery = useActivePrograms();
  const profileId = meQuery.data?.clientProfileId ?? null;
  const activeProgramId = activeProgramsQuery.data?.primary_program_id ?? null;
  const profileQuery = useClientProfile(profileId);
  const referenceDataQuery = useReferenceData();
  const updateClientProfile = useUpdateClientProfile(profileId ?? "");
  const regenerateDays = useRegenerateDays(activeProgramId ?? "");

  const [selectedPresetCode, setSelectedPresetCode] = useState<string | null>(null);
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]);
  const [originalPresetCode, setOriginalPresetCode] = useState<string | null>(null);
  const [originalItemCodes, setOriginalItemCodes] = useState<string[]>([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});
  const pendingPrefillPresetRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Equipment",
    });
  }, [navigation]);

  useEffect(() => {
    if (!profileQuery.data) return;
    const preset = profileQuery.data.equipmentPreset ?? null;
    const items = profileQuery.data.equipmentItemCodes ?? [];
    setSelectedPresetCode(preset);
    setSelectedItemCodes(items);
    setOriginalPresetCode(preset);
    setOriginalItemCodes(items);
  }, [profileQuery.data]);

  const equipmentItemsQuery = useEquipmentItems(selectedPresetCode);

  const presetOptions = useMemo(
    () =>
      (referenceDataQuery.data?.equipmentPresets ?? []).map((preset) => ({
        value: preset.code,
        title: preset.label,
      })),
    [referenceDataQuery.data?.equipmentPresets],
  );

  const fullCatalogItems = useMemo<EquipmentCatalogItem[] | null>(() => {
    const raw = referenceDataQuery.data as unknown as Record<string, unknown> | undefined;
    const maybeItems = raw?.equipmentItems ?? raw?.equipment_items;
    if (!Array.isArray(maybeItems)) return null;
    const mapped = maybeItems
      .map((item) => {
        const record = item as Record<string, unknown>;
        const code = String(record.code ?? "").trim();
        if (!code) return null;
        const label = String(record.label ?? code);
        const categoryRaw = record.category;
        const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : null;
        return { code, label, category };
      })
      .filter((item): item is EquipmentCatalogItem => Boolean(item));
    const deduped = dedupeEquipmentItems(mapped);
    return deduped.length > 0 ? deduped : null;
  }, [referenceDataQuery.data]);

  const presetItems = useMemo<EquipmentCatalogItem[]>(
    () =>
      dedupeEquipmentItems((equipmentItemsQuery.data?.items ?? []).map((item) => ({
        code: item.code,
        label: item.label,
        category: item.category,
      }))),
    [equipmentItemsQuery.data?.items],
  );

  const catalogSourceItems = useMemo(
    () => fullCatalogItems ?? presetItems,
    [fullCatalogItems, presetItems],
  );

  const groupedCategoryOptions = useMemo(() => {
    const byCategory: Record<string, Array<{ value: string; label: string }>> = {};
    const query = search.trim().toLowerCase();
    catalogSourceItems.forEach((item) => {
      const displayLabel = toTitleCase(item.label);
      if (query && !displayLabel.toLowerCase().includes(query)) return;
      const category = item.category ? toTitleCase(item.category) : "Other";
      byCategory[category] = byCategory[category] ?? [];
      byCategory[category].push({
        value: item.code,
        label: displayLabel,
      });
    });

    return Object.entries(byCategory)
      .map(([category, options]) => ({
        category,
        options: options.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [catalogSourceItems, search]);

  useEffect(() => {
    const keys = groupedCategoryOptions.map((group) => group.category);
    setCollapsedByCategory((current) => {
      const next: Record<string, boolean> = {};
      keys.forEach((key) => {
        next[key] = current[key] ?? false;
      });
      return next;
    });
  }, [groupedCategoryOptions]);

  useEffect(() => {
    if (!selectedPresetCode) return;
    if (!equipmentItemsQuery.data) return;
    if (pendingPrefillPresetRef.current !== selectedPresetCode) return;
    setSelectedItemCodes(equipmentItemsQuery.data.items.map((item) => item.code).filter(Boolean));
    pendingPrefillPresetRef.current = null;
  }, [equipmentItemsQuery.data, selectedPresetCode]);

  const isDirty = useMemo(() => {
    return selectedPresetCode !== originalPresetCode
      || JSON.stringify(normalizeCodes(selectedItemCodes)) !== JSON.stringify(normalizeCodes(originalItemCodes));
  }, [originalItemCodes, originalPresetCode, selectedItemCodes, selectedPresetCode]);

  function handleSelectPreset(presetCode: string): void {
    setError(null);
    setInfoBanner(null);
    pendingPrefillPresetRef.current = presetCode;
    setSelectedPresetCode(presetCode);
    setSelectedItemCodes([]);
  }

  function toggleEquipmentItem(code: string): void {
    setSelectedItemCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  async function handleSaveAndRegenerate(): Promise<void> {
    if (!profileId) return;
    setIsSaving(true);
    setError(null);
    setInfoBanner(null);
    let profileUpdated = false;
    try {
      await updateClientProfile.mutateAsync({
        equipmentPreset: selectedPresetCode,
        equipmentItemCodes: selectedItemCodes,
      });
      profileUpdated = true;

      if (activeProgramId) {
        const equipState = await getProgramEquipment(activeProgramId);
        const dayIds = equipState.futureDays.map((day) => day.programDayId);
        if (dayIds.length > 0) {
          await regenerateDays.mutateAsync({
            dayIds,
            equipmentPresetSlug: selectedPresetCode,
            equipmentItemSlugs: selectedItemCodes,
          });
        }
      }

      setConfirmModalVisible(false);
      navigation.goBack();
    } catch {
      setConfirmModalVisible(false);
      setError(
        profileUpdated
          ? "Equipment updated but regeneration failed. Try changing equipment from a specific workout day."
          : "Failed to save. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDefaultOnly(): Promise<void> {
    if (!profileId) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateClientProfile.mutateAsync({
        equipmentPreset: selectedPresetCode,
        equipmentItemCodes: selectedItemCodes,
      });
      setConfirmModalVisible(false);
      setOriginalPresetCode(selectedPresetCode);
      setOriginalItemCodes(selectedItemCodes);
      setInfoBanner(
        "Your default equipment is updated. To change equipment for a specific session, open that workout and tap 'Change equipment'.",
      );
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const isLoading = meQuery.isLoading || profileQuery.isLoading || referenceDataQuery.isLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SectionCard title="Equipment setup">
          {isLoading ? <Text style={styles.statusText}>Loading your equipment setup...</Text> : null}
          {referenceDataQuery.isError || profileQuery.isError ? (
            <Text style={styles.errorText}>Unable to load your equipment settings right now.</Text>
          ) : null}

          <PresetCardList
            options={presetOptions}
            selectedValue={selectedPresetCode}
            onSelect={handleSelectPreset}
          />

          {selectedPresetCode ? (
            <View style={styles.itemsSection}>
              <View style={styles.helperBox}>
                <Text style={styles.helperText}>
                  We&apos;ve prefilled a typical setup for this preset. Add or remove items to match what you actually have.
                </Text>
              </View>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search equipment"
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
              />

              {groupedCategoryOptions.map((group) => (
                <EquipmentCategorySection
                  key={group.category}
                  category={group.category}
                  options={group.options}
                  selectedValues={selectedItemCodes}
                  collapsed={Boolean(collapsedByCategory[group.category])}
                  onToggleCollapsed={() => {
                    setCollapsedByCategory((current) => ({
                      ...current,
                      [group.category]: !current[group.category],
                    }));
                  }}
                  onToggleItem={toggleEquipmentItem}
                />
              ))}
            </View>
          ) : null}
        </SectionCard>

        <PressableScale
          style={[styles.saveButton, (!isDirty || isSaving || !profileId) && styles.saveButtonDisabled]}
          disabled={!isDirty || isSaving || !profileId}
          onPress={() => {
            setError(null);
            setConfirmModalVisible(true);
          }}
        >
          <Text style={styles.saveButtonLabel}>{isSaving ? "Saving..." : "Save changes"}</Text>
        </PressableScale>

        {infoBanner ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>{infoBanner}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={confirmModalVisible}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply equipment changes?</Text>
            <Text style={styles.modalBody}>
              Do you want to update all future scheduled workouts to use this equipment? Completed workouts will not be changed.
            </Text>
            <PressableScale
              style={styles.modalPrimaryButton}
              disabled={isSaving}
              onPress={() => {
                void handleSaveAndRegenerate();
              }}
            >
              <Text style={styles.modalPrimaryLabel}>Yes, update all future workouts</Text>
            </PressableScale>
            <PressableScale
              style={styles.modalSecondaryButton}
              disabled={isSaving}
              onPress={() => {
                void handleSaveDefaultOnly();
              }}
            >
              <Text style={styles.modalSecondaryLabel}>No, change only my default</Text>
            </PressableScale>
            <PressableScale
              style={styles.modalGhostButton}
              disabled={isSaving}
              onPress={() => setConfirmModalVisible(false)}
            >
              <Text style={styles.modalGhostLabel}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  statusText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  itemsSection: {
    gap: spacing.sm,
  },
  helperBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  helperText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  saveButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  infoBanner: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.12)",
    padding: spacing.md,
  },
  infoBannerText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  modalBody: {
    color: colors.textSecondary,
    ...typography.body,
  },
  modalPrimaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalPrimaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
    textAlign: "center",
  },
  modalSecondaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalSecondaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
    textAlign: "center",
  },
  modalGhostButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
});
