import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useEquipmentItems,
  useMe,
  useProgramEquipment,
  useReferenceData,
  useRegenerateDays,
  useUpdateClientProfile,
} from "../../api/hooks";
import { EquipmentCategorySection } from "../onboarding/EquipmentCategorySection";
import { PresetCardList } from "../onboarding/PresetCardList";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";

type EquipmentOverrideSheetProps = {
  visible: boolean;
  onClose: () => void;
  onApplied?: (message?: string | null) => void;
  programId: string;
  programDayId: string;
  scheduledWeekday: string;
  scheduledWeekdayLabel: string;
  weekNumber: number;
  currentPresetSlug: string | null;
  currentItemSlugs: string[];
};

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

export function EquipmentOverrideSheet({
  visible,
  onClose,
  onApplied,
  programId,
  programDayId,
  scheduledWeekday,
  scheduledWeekdayLabel,
  weekNumber,
  currentPresetSlug,
  currentItemSlugs,
}: EquipmentOverrideSheetProps): React.JSX.Element {
  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? null;
  const referenceDataQuery = useReferenceData();
  const programEquipmentQuery = useProgramEquipment(visible ? programId : null);
  const regenerateDays = useRegenerateDays(programId);
  const updateClientProfile = useUpdateClientProfile(profileId ?? "");

  const [step, setStep] = useState<"equipment" | "scope" | "confirm-global">("equipment");
  const [selectedPresetCode, setSelectedPresetCode] = useState<string | null>(currentPresetSlug);
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>(currentItemSlugs);
  const [search, setSearch] = useState("");
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGlobalDayIds, setPendingGlobalDayIds] = useState<string[]>([]);
  const pendingPrefillPresetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("equipment");
      setSearch("");
      setError(null);
      setPendingGlobalDayIds([]);
      return;
    }

    const fallbackPreset =
      currentPresetSlug ?? programEquipmentQuery.data?.profileDefault.equipmentPresetSlug ?? null;
    const fallbackItems =
      currentItemSlugs.length > 0
        ? currentItemSlugs
        : programEquipmentQuery.data?.profileDefault.equipmentItemSlugs ?? [];

    setSelectedPresetCode(fallbackPreset);
    setSelectedItemCodes(fallbackItems);
  }, [
    currentItemSlugs,
    currentPresetSlug,
    programEquipmentQuery.data?.profileDefault.equipmentItemSlugs,
    programEquipmentQuery.data?.profileDefault.equipmentPresetSlug,
    visible,
  ]);

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

  function handleSelectPreset(presetCode: string): void {
    pendingPrefillPresetRef.current = presetCode;
    setSelectedPresetCode(presetCode);
    setSelectedItemCodes([]);
    setError(null);
  }

  function toggleEquipmentItem(code: string): void {
    setSelectedItemCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  async function handleApply(scope: "today" | "weekday" | "week" | "all"): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      const equipState = programEquipmentQuery.data ?? (await programEquipmentQuery.refetch()).data;
      const futureDays = equipState?.futureDays ?? [];
      let dayIds: string[] = [];

      if (scope === "today") {
        dayIds = [programDayId];
      } else if (scope === "weekday") {
        dayIds = futureDays
          .filter((day) => day.scheduledWeekday === scheduledWeekday)
          .map((day) => day.programDayId);
        if (!dayIds.includes(programDayId)) dayIds = [programDayId, ...dayIds];
      } else if (scope === "week") {
        dayIds = futureDays
          .filter((day) => day.weekNumber === weekNumber)
          .map((day) => day.programDayId);
        if (!dayIds.includes(programDayId)) dayIds = [programDayId, ...dayIds];
      } else {
        const allDayIds = futureDays.map((day) => day.programDayId);
        if (!allDayIds.includes(programDayId)) allDayIds.unshift(programDayId);
        setPendingGlobalDayIds(allDayIds);
        setStep("confirm-global");
        setIsSaving(false);
        return;
      }

      const result = await regenerateDays.mutateAsync({
        dayIds,
        equipmentPresetSlug: selectedPresetCode,
        equipmentItemSlugs: selectedItemCodes,
      });

      const message = result.partiallyLogged > 0
        ? `${result.partiallyLogged} workout day${result.partiallyLogged !== 1 ? "s were" : " was"} left unchanged to preserve partial logs.`
        : scope === "today"
          ? "Workout updated with new equipment."
          : `${result.regenerated} workout${result.regenerated !== 1 ? "s" : ""} updated with new equipment.`;

      onClose();
      onApplied?.(message);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to apply equipment changes. Please try again.";
      setError(message);
      setStep("scope");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmGlobal(updateDefault: boolean): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      if (updateDefault && profileId) {
        await updateClientProfile.mutateAsync({
          equipmentPreset: selectedPresetCode,
          equipmentItemCodes: selectedItemCodes,
        });
      }

      const result = await regenerateDays.mutateAsync({
        dayIds: pendingGlobalDayIds,
        equipmentPresetSlug: selectedPresetCode,
        equipmentItemSlugs: selectedItemCodes,
      });

      const message = result.partiallyLogged > 0
        ? `${result.partiallyLogged} workout day${result.partiallyLogged !== 1 ? "s were" : " was"} left unchanged to preserve partial logs.`
        : `${result.regenerated} workout${result.regenerated !== 1 ? "s" : ""} updated with new equipment.`;

      onClose();
      onApplied?.(message);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to apply equipment changes. Please try again.";
      setError(message);
      setStep("scope");
    } finally {
      setIsSaving(false);
    }
  }

  function renderEquipmentStep(): React.JSX.Element {
    return (
      <View style={styles.sheetCard}>
        <View style={styles.handle} />
        <Text style={styles.title}>Equipment for this session</Text>
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {programEquipmentQuery.isLoading || referenceDataQuery.isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.stateText}>Loading equipment options...</Text>
            </View>
          ) : null}

          <PresetCardList
            options={presetOptions}
            selectedValue={selectedPresetCode}
            onSelect={handleSelectPreset}
          />

          {selectedPresetCode ? (
            <>
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
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <PressableScale
          style={styles.primaryButton}
          onPress={() => setStep("scope")}
          disabled={!selectedPresetCode || isSaving}
        >
          <Text style={styles.primaryButtonLabel}>Apply</Text>
        </PressableScale>
      </View>
    );
  }

  function renderScopeRow(
    label: string,
    scope: "today" | "weekday" | "week" | "all",
  ): React.JSX.Element {
    return (
      <PressableScale
        key={scope}
        style={styles.scopeRow}
        disabled={isSaving}
        onPress={() => {
          void handleApply(scope);
        }}
      >
        <Text style={styles.scopeLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </PressableScale>
    );
  }

  function renderScopeStep(): React.JSX.Element {
    return (
      <View style={styles.sheetCard}>
        <View style={styles.handle} />
        <Text style={styles.title}>Apply to...</Text>
        <View style={styles.scopeList}>
          {renderScopeRow("Today only", "today")}
          {renderScopeRow(
            scheduledWeekdayLabel ? `All future ${scheduledWeekdayLabel}` : "All future (this weekday)",
            "weekday",
          )}
          {renderScopeRow("All future workouts this week", "week")}
          {renderScopeRow("All future workouts", "all")}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PressableScale
          style={styles.secondaryButton}
          disabled={isSaving}
          onPress={() => setStep("equipment")}
        >
          <Text style={styles.secondaryButtonLabel}>Back</Text>
        </PressableScale>
      </View>
    );
  }

  function renderConfirmGlobalStep(): React.JSX.Element {
    return (
      <View style={styles.sheetCard}>
        <View style={styles.handle} />
        <Text style={styles.title}>Update your default equipment?</Text>
        <Text style={styles.bodyText}>
          This will also update your default equipment across all future programmes. You can always change this in Settings.
        </Text>
        <PressableScale
          style={styles.primaryButton}
          disabled={isSaving}
          onPress={() => {
            void handleConfirmGlobal(true);
          }}
        >
          <Text style={styles.primaryButtonLabel}>
            {isSaving ? "Saving..." : "Yes, update my default"}
          </Text>
        </PressableScale>
        <PressableScale
          style={styles.secondaryButton}
          disabled={isSaving}
          onPress={() => {
            void handleConfirmGlobal(false);
          }}
        >
          <Text style={styles.secondaryButtonLabel}>No, just update these workouts</Text>
        </PressableScale>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <PressableScale style={styles.backdropPressable} onPress={onClose}>
          <View style={styles.backdropPressable} />
        </PressableScale>
        <View style={styles.sheetWrap}>
          {step === "equipment"
            ? renderEquipmentStep()
            : step === "scope"
              ? renderScopeStep()
              : renderConfirmGlobalStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "flex-end",
  },
  backdropPressable: {
    flex: 1,
  },
  sheetWrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetCard: {
    maxHeight: "88%",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  bodyText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  bodyScroll: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  stateBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  stateText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
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
  primaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  primaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  scopeList: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  scopeRow: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  scopeLabel: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
});
