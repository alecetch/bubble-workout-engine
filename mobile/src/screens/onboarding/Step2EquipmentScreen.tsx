import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { EquipmentCategorySection } from "../../components/onboarding/EquipmentCategorySection";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { useErrorPulse } from "../../components/onboarding/useErrorPulse";
import { PresetCardList } from "../../components/onboarding/PresetCardList";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useEquipmentItems, useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { validateStep } from "../../state/onboarding/validators";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2Equipment">;

// Manual test:
// 1) Open Step2Equipment -> presets load from API.
// 2) Select preset -> items load from /equipment-items.
// 3) Toggle items rapidly -> UI remains correct without per-tap PATCH requests.
// 4) Continue -> profile saves; navigate away/back -> selection persists.
export function Step2EquipmentScreen({ navigation }: Props): React.JSX.Element {
  const meQuery = useMe();
  const referenceDataQuery = useReferenceData();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const draft = useOnboardingStore((state) => state.draft);
  const attemptedStep2 = useOnboardingStore((state) => state.attempted.step2);
  const fieldErrors = useOnboardingStore((state) => state.fieldErrors);
  const isSaving = useOnboardingStore((state) => state.isSaving);

  const setDraft = useOnboardingStore((state) => state.setDraft);
  const setAttempted = useOnboardingStore((state) => state.setAttempted);
  const setFieldErrors = useOnboardingStore((state) => state.setFieldErrors);
  const setIsSaving = useOnboardingStore((state) => state.setIsSaving);

  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [helperHighlighted, setHelperHighlighted] = useState(false);
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});
  const sectionPulse = useErrorPulse();
  const pendingPrefillPresetRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const equipmentListOffsetRef = useRef(0);

  const selectedPresetCode = draft.equipmentPresetCode;
  const equipmentItemsQuery = useEquipmentItems(selectedPresetCode);

  const presetOptions = useMemo(
    () =>
      (referenceDataQuery.data?.equipmentPresets ?? []).map((preset) => ({
        value: preset.code,
        title: preset.label,
      })),
    [referenceDataQuery.data?.equipmentPresets],
  );

  type EquipmentCatalogItem = {
    code: string;
    label: string;
    category: string | null;
  };

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
    return mapped.length > 0 ? mapped : null;
  }, [referenceDataQuery.data]);

  const presetItems = useMemo<EquipmentCatalogItem[]>(
    () =>
      (equipmentItemsQuery.data?.items ?? []).map((item) => ({
        code: item.code,
        label: item.label,
        category: item.category,
      })),
    [equipmentItemsQuery.data?.items],
  );

  const catalogSourceItems = useMemo(
    () => fullCatalogItems ?? presetItems,
    [fullCatalogItems, presetItems],
  );

  const hasFullCatalog = Boolean(fullCatalogItems && fullCatalogItems.length > 0);
  const selectedPresetTitle = useMemo(
    () => presetOptions.find((preset) => preset.value === selectedPresetCode)?.title ?? "this preset",
    [presetOptions, selectedPresetCode],
  );

  const updateValidation = (nextDraft: typeof draft): void => {
    const validation = validateStep(2, nextDraft);
    setFieldErrors(validation.fieldErrors);
  };

  const handleSelectPreset = (presetCode: string): void => {
    setPrefillError(null);
    pendingPrefillPresetRef.current = presetCode;
    const nextDraft = {
      ...draft,
      equipmentPresetCode: presetCode,
      selectedEquipmentCodes: [],
    };
    setDraft({
      equipmentPresetCode: presetCode,
      selectedEquipmentCodes: [],
    });
    updateValidation(nextDraft);
  };

  useEffect(() => {
    if (!equipmentItemsQuery.isError) return;
    setPrefillError("Unable to prefill equipment for this preset. Please try again.");
  }, [equipmentItemsQuery.isError]);

  useEffect(() => {
    if (!selectedPresetCode) return;
    if (!equipmentItemsQuery.data) return;
    if (pendingPrefillPresetRef.current !== selectedPresetCode) return;

    setPrefillError(null);
    const selectedEquipmentCodes = equipmentItemsQuery.data.items.map((item) => item.code).filter(Boolean);
    const currentDraft = useOnboardingStore.getState().draft;
    const nextDraft = {
      ...currentDraft,
      equipmentPresetCode: selectedPresetCode,
      selectedEquipmentCodes,
    };
    setDraft({
      equipmentPresetCode: selectedPresetCode,
      selectedEquipmentCodes,
    });
    updateValidation(nextDraft);
    pendingPrefillPresetRef.current = null;
  }, [equipmentItemsQuery.data, selectedPresetCode, setDraft]);

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

  const toggleEquipmentItem = (code: string): void => {
    const selectedEquipmentCodes = draft.selectedEquipmentCodes.includes(code)
      ? draft.selectedEquipmentCodes.filter((item) => item !== code)
      : [...draft.selectedEquipmentCodes, code];
    const nextDraft = { ...draft, selectedEquipmentCodes };
    setDraft({ selectedEquipmentCodes });
    updateValidation(nextDraft);
  };

  const handleBack = (): void => {
    navigation.replace("Step1Goals");
  };

  const handleNext = async (): Promise<void> => {
    setAttempted(2);

    const validation = validateStep(2, draft);
    setFieldErrors(validation.fieldErrors);

    if (!validation.isValid || prefillError) {
      await hapticHeavy();
      sectionPulse.pulse();
      return;
    }

    if (!profileId) {
      setPrefillError("Unable to save equipment right now. Please retry.");
      await hapticHeavy();
      sectionPulse.pulse();
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        equipmentPreset: draft.equipmentPresetCode,
        equipmentItemCodes: draft.selectedEquipmentCodes,
        onboardingStepCompleted: draft.onboardingStepCompleted < 2 ? 2 : draft.onboardingStepCompleted,
      });
      navigation.replace("Step3Schedule");
    } catch {
      setPrefillError("Unable to save this step. Please try again.");
      await hapticHeavy();
      sectionPulse.pulse();
    } finally {
      setIsSaving(false);
    }
  };

  const nextDisabled = isSaving || referenceDataQuery.isLoading;

  const handlePresetHelpPress = (): void => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(equipmentListOffsetRef.current - spacing.lg, 0),
      animated: true,
    });
    setHelperHighlighted(true);
    setTimeout(() => setHelperHighlighted(false), 1200);
  };

  return (
    <OnboardingScaffold
      step={2}
      title="Equipment setup"
      subtitle="Pick your setup and we'll prefill your available equipment."
      errorBannerVisible={attemptedStep2 && (Object.keys(fieldErrors).length > 0 || !!prefillError)}
      onBack={handleBack}
      onNext={() => {
        void handleNext();
      }}
      nextLabel="Next"
      nextDisabled={nextDisabled}
      isSaving={isSaving}
      scrollViewRef={scrollViewRef}
    >
      <Animated.View style={sectionPulse.animatedStyle}>
        <SectionCard title="Equipment presets" subtitle="Choose the option that best matches your setup.">
          <PresetCardList
            options={presetOptions}
            selectedValue={draft.equipmentPresetCode}
            onSelect={(value) => {
              handleSelectPreset(value);
            }}
            onHelpPress={handlePresetHelpPress}
          />

          {referenceDataQuery.isLoading ? (
            <Text style={styles.statusText}>Loading equipment presets...</Text>
          ) : null}
          {referenceDataQuery.isError ? (
            <View style={styles.retryRow}>
              <Text style={styles.errorText}>Unable to load equipment presets.</Text>
              <PressableScale
                style={styles.retryButton}
                onPress={() => {
                  void referenceDataQuery.refetch();
                }}
              >
                <Text style={styles.retryLabel}>Retry</Text>
              </PressableScale>
            </View>
          ) : null}

          {selectedPresetCode && equipmentItemsQuery.isLoading ? (
            <Text style={styles.statusText}>Prefilling equipment list...</Text>
          ) : null}

          {selectedPresetCode && equipmentItemsQuery.isError ? (
            <View style={styles.retryRow}>
              <Text style={styles.errorText}>Unable to load equipment items for this preset.</Text>
              <PressableScale
                style={styles.retryButton}
                onPress={() => {
                  void equipmentItemsQuery.refetch();
                }}
              >
                <Text style={styles.retryLabel}>Retry</Text>
              </PressableScale>
            </View>
          ) : null}

          {selectedPresetCode && equipmentItemsQuery.isSuccess && presetItems.length === 0 ? (
            <Text style={styles.statusText}>No equipment items for this preset.</Text>
          ) : null}

          {selectedPresetCode && catalogSourceItems.length > 0 ? (
            <View
              style={styles.itemsSection}
              onLayout={(event) => {
                equipmentListOffsetRef.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.itemsLabel}>Equipment items</Text>
              <View style={[styles.helperBox, helperHighlighted && styles.helperBoxActive]}>
                <Text style={styles.helperText}>
                  {`Below is a typical equipment setup for ${selectedPresetTitle}. You can add or remove items to match what you actually have available.`}
                </Text>
                <Text style={styles.helperSubtext}>
                  Tip: if you have extra kit (e.g., a BikeErg at home), add it from the categories below.
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
                  selectedValues={draft.selectedEquipmentCodes}
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

              {groupedCategoryOptions.length === 0 ? (
                <Text style={styles.statusText}>No equipment matches your search.</Text>
              ) : null}

              {!hasFullCatalog ? (
                <Text style={styles.catalogFallbackText}>
                  More equipment options will appear here once the full catalog endpoint is connected.
                </Text>
              ) : null}
            </View>
          ) : null}

          {prefillError ? <Text style={styles.errorText}>{prefillError}</Text> : null}
          {fieldErrors.equipmentPreset ? <Text style={styles.errorText}>{fieldErrors.equipmentPreset}</Text> : null}
          {fieldErrors.equipmentItemCodes ? <Text style={styles.errorText}>{fieldErrors.equipmentItemCodes}</Text> : null}
        </SectionCard>
      </Animated.View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  statusText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    ...typography.small,
  },
  itemsSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  itemsLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  helperBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  helperBoxActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  helperText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  helperSubtext: {
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
  catalogFallbackText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  retryRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.warning,
    ...typography.small,
  },
});
