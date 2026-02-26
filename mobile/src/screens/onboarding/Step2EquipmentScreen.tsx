import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { useErrorPulse } from "../../components/onboarding/useErrorPulse";
import { PresetCardList } from "../../components/onboarding/PresetCardList";
import { PillGrid } from "../../components/onboarding/PillGrid";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useEquipmentItems, useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { validateStep } from "../../state/onboarding/validators";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
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
  const sectionPulse = useErrorPulse();
  const pendingPrefillPresetRef = useRef<string | null>(null);

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
  const equipmentItemOptions = useMemo(
    () =>
      (equipmentItemsQuery.data?.items ?? []).map((item) => ({
        value: item.code,
        label: item.label,
      })),
    [equipmentItemsQuery.data?.items],
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
    >
      <Animated.View style={sectionPulse.animatedStyle}>
        <SectionCard title="Equipment presets" subtitle="Choose the option that best matches your setup.">
          <PresetCardList
            options={presetOptions}
            selectedValue={draft.equipmentPresetCode}
            onSelect={(value) => {
              handleSelectPreset(value);
            }}
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

          {selectedPresetCode && equipmentItemsQuery.isSuccess && equipmentItemOptions.length === 0 ? (
            <Text style={styles.statusText}>No equipment items for this preset.</Text>
          ) : null}

          {selectedPresetCode && equipmentItemOptions.length > 0 ? (
            <View style={styles.itemsSection}>
              <Text style={styles.itemsLabel}>Equipment items</Text>
              <PillGrid
                options={equipmentItemOptions}
                selectedValues={draft.selectedEquipmentCodes}
                onToggle={toggleEquipmentItem}
              />
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
