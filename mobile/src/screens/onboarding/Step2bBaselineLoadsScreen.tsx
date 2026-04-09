import React, { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { SelectField } from "../../components/onboarding/SelectField";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import type { ReferenceDataResponse } from "../../api/referenceData";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import {
  ESTIMATION_FAMILIES,
  ESTIMATION_FAMILY_LABELS,
  RIR_OPTIONS,
  type AnchorLiftEntry,
  type EstimationFamily,
} from "../../state/onboarding/types";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2bBaselineLoads">;

type CardDraft = {
  skipped: boolean;
  exerciseId: string | null;
  loadKgText: string;
  repsText: string;
  rir: number | null;
};

type CardDraftMap = Record<EstimationFamily, CardDraft>;

type AnchorExerciseOption = {
  label: string;
  value: string;
};

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
};

type LoadStepperFieldProps = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
};

type AnchorFamilyCardProps = {
  family: EstimationFamily;
  card: CardDraft;
  options: AnchorExerciseOption[];
  disabled: boolean;
  interacted: boolean;
  onPatch: (partial: Partial<CardDraft>) => void;
};

const DEFAULT_CARD_DRAFT: CardDraft = {
  skipped: true,
  exerciseId: null,
  loadKgText: "",
  repsText: "",
  rir: null,
};

const REP_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const value = String(index + 1);
  return { label: value, value };
});

function makeDefaultDrafts(): CardDraftMap {
  return {
    squat: { ...DEFAULT_CARD_DRAFT },
    hinge: { ...DEFAULT_CARD_DRAFT },
    horizontal_press: { ...DEFAULT_CARD_DRAFT },
    vertical_press: { ...DEFAULT_CARD_DRAFT },
    horizontal_pull: { ...DEFAULT_CARD_DRAFT },
    vertical_pull: { ...DEFAULT_CARD_DRAFT },
  };
}

function sanitizeDecimal(text: string): string {
  return text.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
}

function sanitizeInteger(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

function hasXorLoadAndReps(card: CardDraft): boolean {
  const hasLoad = card.loadKgText.trim().length > 0;
  const hasReps = card.repsText.trim().length > 0;
  return hasLoad !== hasReps;
}

function toAnchorOptions(
  referenceData: ReferenceDataResponse | undefined,
  family: EstimationFamily,
  userEquipmentCodes: string[],
): AnchorExerciseOption[] {
  return (referenceData?.anchorExercises ?? [])
    .filter((exercise) => exercise.estimationFamily === family && exercise.isAnchorEligible)
    .filter((exercise) => exercise.equipmentItemsSlugs.every((slug) => userEquipmentCodes.includes(slug)))
    .sort((a, b) => a.anchorPriority - b.anchorPriority)
    .map((exercise) => ({
      label: exercise.label,
      value: exercise.exerciseId,
    }));
}

function ToggleRow({ label, checked, onPress, disabled = false }: ToggleRowProps): React.JSX.Element {
  return (
    <PressableScale
      style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked, disabled && styles.checkboxDisabled]}>
        {checked ? <Text style={styles.checkboxTick}>X</Text> : null}
      </View>
      <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>{label}</Text>
    </PressableScale>
  );
}


function LoadInputField({
  label,
  value,
  onChangeValue,
}: LoadStepperFieldProps): React.JSX.Element {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.loadTextInput}
        value={value}
        onChangeText={(text) => onChangeValue(sanitizeDecimal(text))}
        keyboardType="decimal-pad"
        textContentType="none"
        autoComplete="off"
        selectTextOnFocus
        placeholder="e.g. 60"
        placeholderTextColor={colors.textSecondary}
        returnKeyType="done"
      />
    </View>
  );
}

function AnchorFamilyCard({
  family,
  card,
  options,
  disabled,
  interacted,
  onPatch,
}: AnchorFamilyCardProps): React.JSX.Element {
  return (
    <SectionCard title={ESTIMATION_FAMILY_LABELS[family]}>
      <ToggleRow
        label="Skip this lift"
        checked={card.skipped}
        disabled={disabled}
        onPress={() => {
          const nextSkipped = !card.skipped;
          onPatch({
            skipped: nextSkipped,
            exerciseId: nextSkipped ? null : card.exerciseId,
            loadKgText: nextSkipped ? "" : card.loadKgText,
            repsText: nextSkipped ? "" : card.repsText,
            rir: nextSkipped ? null : card.rir,
          });
        }}
      />

      {!card.skipped ? (
        <View style={styles.cardFields}>
          <SelectField
            label="Which exercise?"
            valueLabel={options.find((option) => option.value === card.exerciseId)?.label}
            placeholder="Choose an exercise"
            options={options}
            onSelect={(value) => onPatch({ exerciseId: value })}
          />

          <LoadInputField
            label="Load (kg)"
            value={card.loadKgText}
            onChangeValue={(value) => onPatch({ loadKgText: sanitizeDecimal(value) })}
          />

          <SelectField
            label="Reps"
            valueLabel={card.repsText || undefined}
            placeholder="Choose reps"
            options={REP_OPTIONS}
            onSelect={(value) => onPatch({ repsText: sanitizeInteger(value) })}
          />

          <SelectField
            label="Effort / RIR"
            valueLabel={RIR_OPTIONS.find((option) => option.value === card.rir)?.label}
            placeholder="Optional"
            options={RIR_OPTIONS.map((option) => ({ label: option.label, value: String(option.value) }))}
            onSelect={(value) => onPatch({ rir: Number(value) })}
          />

          {interacted && hasXorLoadAndReps(card) ? (
            <Text style={styles.inlineHint}>Enter both load and reps, or skip this lift.</Text>
          ) : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

export function Step2bBaselineLoadsScreen({ navigation }: Props): React.JSX.Element {
  const scrollRef = useRef<ScrollView | null>(null);
  const meQuery = useMe();
  const referenceDataQuery = useReferenceData();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const draft = useOnboardingStore((state) => state.draft);
  const attemptedStep2b = useOnboardingStore((state) => state.attempted.step2b);
  const isSaving = useOnboardingStore((state) => state.isSaving);
  const setDraft = useOnboardingStore((state) => state.setDraft);
  const setAttempted = useOnboardingStore((state) => state.setAttempted);
  const setIsSaving = useOnboardingStore((state) => state.setIsSaving);

  const [stepSkipped, setStepSkipped] = useState(false);
  const [cardDrafts, setCardDrafts] = useState<CardDraftMap>(makeDefaultDrafts);
  const [interactedFamilies, setInteractedFamilies] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const familyOptions = useMemo(() => {
    const userEquipmentCodes = draft.selectedEquipmentCodes;
    return ESTIMATION_FAMILIES.reduce<Record<EstimationFamily, AnchorExerciseOption[]>>(
      (acc, family) => {
        acc[family] = toAnchorOptions(referenceDataQuery.data, family, userEquipmentCodes);
        return acc;
      },
      {
        squat: [],
        hinge: [],
        horizontal_press: [],
        vertical_press: [],
        horizontal_pull: [],
        vertical_pull: [],
      },
    );
  }, [draft.selectedEquipmentCodes, referenceDataQuery.data]);

  const visibleFamilies = useMemo(
    () => ESTIMATION_FAMILIES.filter((family) => familyOptions[family].length > 0),
    [familyOptions],
  );

  const handleCardPatch = (family: EstimationFamily, partial: Partial<CardDraft>): void => {
    setInteractedFamilies((current) => ({ ...current, [family]: true }));
    setCardDrafts((current) => ({
      ...current,
      [family]: {
        ...current[family],
        ...partial,
      },
    }));
  };

  const handleBack = (): void => {
    navigation.replace("Step2Equipment");
  };

  const handleContinue = async (): Promise<void> => {
    setAttempted("2b");
    setSaveError(null);

    const anchorLifts: AnchorLiftEntry[] = visibleFamilies.map((family) => {
      const card = cardDrafts[family];
      return {
        estimationFamily: family,
        exerciseId: card.skipped ? null : card.exerciseId,
        loadKg: card.skipped ? null : Number.parseFloat(card.loadKgText) || null,
        reps: card.skipped ? null : Number.parseInt(card.repsText, 10) || null,
        rir: card.skipped ? null : card.rir,
        skipped: card.skipped,
      };
    });

    const allSkipped = anchorLifts.every((entry) => entry.skipped);
    const effectiveStepSkipped = stepSkipped || allSkipped;

    if (!profileId) {
      setSaveError("Unable to save this step right now. Please try again.");
      await hapticHeavy();
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        anchorLifts: effectiveStepSkipped ? [] : anchorLifts,
        anchorLiftsSkipped: effectiveStepSkipped,
      });
      setDraft({
        anchorLifts: effectiveStepSkipped ? [] : anchorLifts,
        anchorLiftsSkipped: effectiveStepSkipped,
      });
      navigation.replace("Step3Schedule");
    } catch {
      setSaveError("Unable to save this step. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OnboardingScaffold
      step={3}
      title="Help us calibrate your first workout"
      subtitle={
        "Tell us a recent working weight for a few key lifts - not your max, just a weight you've used for solid working sets. We'll use these to suggest starting loads for your first session.\n\nIf you don't know a lift or haven't trained it recently, just skip it."
      }
      errorBannerVisible={attemptedStep2b && Boolean(saveError)}
      onBack={handleBack}
      onNext={() => {
        void handleContinue();
      }}
      nextLabel="Continue"
      nextDisabled={isSaving || referenceDataQuery.isLoading}
      isSaving={isSaving}
      scrollViewRef={scrollRef}
    >
      <SectionCard title="Baseline loads" subtitle="This step is optional.">
        <ToggleRow
          label="Skip this step"
          checked={stepSkipped}
          onPress={() => setStepSkipped((current) => !current)}
        />
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </SectionCard>

      {visibleFamilies.map((family) => (
        <AnchorFamilyCard
          key={family}
          family={family}
          card={cardDrafts[family]}
          options={familyOptions[family]}
          disabled={stepSkipped}
          interacted={Boolean(interactedFamilies[family])}
          onPatch={(partial) => handleCardPatch(family, partial)}
        />
      ))}

      {!referenceDataQuery.isLoading && visibleFamilies.length === 0 ? (
        <SectionCard title="No anchor lifts available">
          <Text style={styles.emptyText}>
            We couldn&apos;t find any eligible anchor lifts for your current equipment setup. Continue and we&apos;ll skip this step.
          </Text>
        </SectionCard>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleRowDisabled: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkboxDisabled: {
    borderColor: colors.border,
  },
  checkboxTick: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  toggleLabel: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
  },
  toggleLabelDisabled: {
    color: colors.textSecondary,
  },
  cardFields: {
    gap: spacing.sm,
  },
  inputContainer: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.textPrimary,
    ...typography.label,
  },
  loadTextInput: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  inlineHint: {
    color: colors.warning,
    ...typography.small,
  },
  saveError: {
    marginTop: spacing.sm,
    color: colors.warning,
    ...typography.small,
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
