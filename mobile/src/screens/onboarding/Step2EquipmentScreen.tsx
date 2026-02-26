import React, { useMemo, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { useErrorPulse } from "../../components/onboarding/useErrorPulse";
import { PresetCardList } from "../../components/onboarding/PresetCardList";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { getEquipmentItemsForPreset } from "../../api/equipmentPresets";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { EQUIPMENT_PRESETS, type EquipmentPreset } from "../../state/onboarding/types";
import { validateStep } from "../../state/onboarding/validators";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2Equipment">;

export function Step2EquipmentScreen({ navigation }: Props): React.JSX.Element {
  const meQuery = useMe();
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

  const [isPrefilling, setIsPrefilling] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const sectionPulse = useErrorPulse();

  const presetOptions = useMemo(
    () => EQUIPMENT_PRESETS.map((preset) => ({ value: preset, title: preset })),
    [],
  );

  const updateValidation = (nextDraft: typeof draft): void => {
    const validation = validateStep(2, nextDraft);
    setFieldErrors(validation.fieldErrors);
  };

  const handleSelectPreset = async (presetValue: string): Promise<void> => {
    const preset = presetValue as EquipmentPreset;

    setPrefillError(null);
    setIsPrefilling(true);

    setDraft({ equipmentPreset: preset });

    try {
      const items = await getEquipmentItemsForPreset(preset);
      const equipmentItemCodes = items.map((item) => item.code).filter(Boolean);

      const nextDraft = {
        ...draft,
        equipmentPreset: preset,
        equipmentItemCodes,
      };

      setDraft({
        equipmentPreset: preset,
        equipmentItemCodes,
      });
      updateValidation(nextDraft);

      if (!profileId) {
        setPrefillError("Unable to save equipment right now. Please retry.");
        return;
      }

      await updateClientProfile.mutateAsync({
        equipmentPreset: preset,
        equipmentItemCodes,
      });
    } catch {
      setPrefillError("Unable to prefill equipment for this preset. Please try again.");
      const nextDraft = {
        ...draft,
        equipmentPreset: preset,
      };
      updateValidation(nextDraft);
    } finally {
      setIsPrefilling(false);
    }
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
        equipmentPreset: draft.equipmentPreset,
        equipmentItemCodes: draft.equipmentItemCodes,
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

  const nextDisabled = isSaving || isPrefilling || !!prefillError;

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
            selectedValue={draft.equipmentPreset}
            onSelect={(value) => {
              void handleSelectPreset(value);
            }}
          />

          {isPrefilling ? (
            <Text style={styles.statusText}>Prefilling equipment list...</Text>
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
  errorText: {
    marginTop: spacing.sm,
    color: colors.warning,
    ...typography.small,
  },
});
