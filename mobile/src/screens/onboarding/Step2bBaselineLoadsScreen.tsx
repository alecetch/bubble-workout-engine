import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import type { ReferenceDataResponse } from "../../api/referenceData";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticHeavy } from "../../components/interaction/haptics";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SelectField } from "../../components/onboarding/SelectField";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import {
  ESTIMATION_FAMILIES,
  ESTIMATION_FAMILY_LABELS,
  type AnchorLiftEntry,
  type EstimationFamily,
} from "../../state/onboarding/types";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2bBaselineLoads">;
type Unit = "kg" | "lbs";

type CardDraft = {
  exerciseId: string | null;
  loadText: string;
  reps: number;
};

type CardDraftMap = Record<EstimationFamily, CardDraft>;

type AnchorExerciseOption = {
  label: string;
  value: string;
};

const KG_TO_LBS = 2.2046;

const FITNESS_TEST_DEFAULTS: Record<EstimationFamily, Record<string, number>> = {
  squat: { beginner: 40, intermediate: 80, advanced: 110, elite: 140 },
  hinge: { beginner: 50, intermediate: 90, advanced: 120, elite: 160 },
  horizontal_press: { beginner: 30, intermediate: 60, advanced: 90, elite: 120 },
  vertical_press: { beginner: 25, intermediate: 50, advanced: 75, elite: 100 },
  horizontal_pull: { beginner: 30, intermediate: 55, advanced: 80, elite: 105 },
  vertical_pull: { beginner: 35, intermediate: 60, advanced: 85, elite: 110 },
};

function makeDefaultDrafts(): CardDraftMap {
  return {
    squat: { exerciseId: null, loadText: "", reps: 3 },
    hinge: { exerciseId: null, loadText: "", reps: 3 },
    horizontal_press: { exerciseId: null, loadText: "", reps: 3 },
    vertical_press: { exerciseId: null, loadText: "", reps: 3 },
    horizontal_pull: { exerciseId: null, loadText: "", reps: 3 },
    vertical_pull: { exerciseId: null, loadText: "", reps: 3 },
  };
}

function sanitizeDecimal(text: string): string {
  return text.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
}

function fitnessLevelKey(level: string | null | undefined): string {
  const normalized = String(level ?? "").trim().toLowerCase();
  return ["beginner", "intermediate", "advanced", "elite"].includes(normalized)
    ? normalized
    : "intermediate";
}

function placeholderKg(family: EstimationFamily, levelKey: string): number {
  return FITNESS_TEST_DEFAULTS[family]?.[levelKey] ?? 0;
}

function toDisplayPlaceholder(family: EstimationFamily, levelKey: string, unit: Unit): string {
  const kg = placeholderKg(family, levelKey);
  if (kg === 0) return "";
  const value = unit === "lbs" ? Math.round(kg * KG_TO_LBS) : kg;
  return `e.g. ${value}`;
}

function convertEnteredValue(text: string, fromUnit: Unit, toUnit: Unit): string {
  if (fromUnit === toUnit) return text;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (fromUnit === "kg" && toUnit === "lbs") return String(Math.round(value * KG_TO_LBS));
  return String(Math.round((value / KG_TO_LBS) * 10) / 10);
}

function parseLoadKg(text: string, unit: Unit): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return unit === "lbs" ? Math.round((value / KG_TO_LBS) * 10) / 10 : value;
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

function UnitToggle({
  unit,
  onSelect,
}: {
  unit: Unit;
  onSelect: (unit: Unit) => void;
}): React.JSX.Element {
  return (
    <View style={styles.unitToggleRow}>
      {(["kg", "lbs"] as const).map((item) => (
        <PressableScale
          key={item}
          style={[styles.unitChip, unit === item && styles.unitChipActive]}
          onPress={() => onSelect(item)}
          accessibilityLabel={`Use ${item}`}
        >
          <Text style={[styles.unitChipText, unit === item && styles.unitChipTextActive]}>
            {item.toUpperCase()}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

function RepsStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <View style={styles.stepperRow}>
      <PressableScale
        style={[styles.stepperBtn, value === 1 && styles.stepperBtnDisabled]}
        disabled={value === 1}
        onPress={() => onChange(Math.max(1, value - 1))}
        accessibilityLabel="Decrease reps"
      >
        <Text style={styles.stepperBtnText}>-</Text>
      </PressableScale>
      <Text style={styles.stepperCount}>{value}</Text>
      <PressableScale
        style={[styles.stepperBtn, value === 30 && styles.stepperBtnDisabled]}
        disabled={value === 30}
        onPress={() => onChange(Math.min(30, value + 1))}
        accessibilityLabel="Increase reps"
      >
        <Text style={styles.stepperBtnText}>+</Text>
      </PressableScale>
    </View>
  );
}

function AnchorFamilyRow({
  family,
  card,
  options,
  unit,
  levelKey,
  onPatch,
}: {
  family: EstimationFamily;
  card: CardDraft;
  options: AnchorExerciseOption[];
  unit: Unit;
  levelKey: string;
  onPatch: (partial: Partial<CardDraft>) => void;
}): React.JSX.Element {
  const resolvedExerciseId = card.exerciseId ?? options[0]?.value ?? null;
  const exerciseLabel =
    options.find((option) => option.value === resolvedExerciseId)?.label ?? "Choose";

  return (
    <View style={styles.anchorRow}>
      <View style={styles.anchorLeft}>
        <Text style={styles.anchorFamilyLabel} numberOfLines={1}>
          {ESTIMATION_FAMILY_LABELS[family]}
        </Text>
        <SelectField
          label="Exercise"
          valueLabel={exerciseLabel}
          placeholder="Choose"
          options={options}
          onSelect={(value) => onPatch({ exerciseId: value })}
        />
      </View>
      <View style={styles.weightInputWrapper}>
        <TextInput
          testID={`weight-input-${family}`}
          style={styles.weightInput}
          value={card.loadText}
          onChangeText={(text) => onPatch({ loadText: sanitizeDecimal(text) })}
          keyboardType="decimal-pad"
          textContentType="none"
          autoComplete="off"
          selectTextOnFocus
          placeholder={toDisplayPlaceholder(family, levelKey, unit)}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
        />
        <Text style={styles.weightUnitLabel}>{unit}</Text>
      </View>
      <RepsStepper value={card.reps} onChange={(reps) => onPatch({ reps })} />
    </View>
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

  const [unit, setUnit] = useState<Unit>(() => draft.preferredUnit ?? "kg");
  const [cardDrafts, setCardDrafts] = useState<CardDraftMap>(makeDefaultDrafts);
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
  const levelKey = fitnessLevelKey(draft.fitnessLevel);

  function handleBack(): void {
    navigation.replace("Step2Equipment");
  }

  function handleUnitChange(next: Unit): void {
    if (next === unit) return;
    setCardDrafts((current) => {
      const updated = { ...current };
      for (const family of ESTIMATION_FAMILIES) {
        const card = current[family];
        updated[family] = {
          ...card,
          loadText: convertEnteredValue(card.loadText, unit, next),
        };
      }
      return updated;
    });
    setUnit(next);
  }

  async function saveSkipped(): Promise<void> {
    if (!profileId) return;
    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        anchorLifts: [],
        anchorLiftsSkipped: true,
        preferredUnit: unit,
      });
      setDraft({ anchorLifts: [], anchorLiftsSkipped: true, preferredUnit: unit });
      navigation.replace("Step3Schedule");
    } catch {
      setSaveError("Unable to save this step. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (referenceDataQuery.isLoading) return;
    if (visibleFamilies.length === 0) {
      void saveSkipped();
    }
  }, [referenceDataQuery.isLoading, visibleFamilies.length]);

  async function handleContinue(): Promise<void> {
    setSaveError(null);
    setAttempted("2b");

    if (!profileId) {
      setSaveError("Unable to save this step right now. Please try again.");
      await hapticHeavy();
      return;
    }

    const anchorLifts: AnchorLiftEntry[] = visibleFamilies.map((family) => {
      const card = cardDrafts[family];
      const resolvedExerciseId = card.exerciseId ?? familyOptions[family][0]?.value ?? null;
      const loadKg = parseLoadKg(card.loadText, unit);
      const skipped = loadKg === null;
      return {
        estimationFamily: family,
        exerciseId: skipped ? null : resolvedExerciseId,
        loadKg: skipped ? null : loadKg,
        reps: skipped ? null : card.reps,
        rir: null,
        skipped,
      };
    });
    const allSkipped = anchorLifts.every((entry) => entry.skipped);

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        anchorLifts: allSkipped ? [] : anchorLifts,
        anchorLiftsSkipped: allSkipped,
        preferredUnit: unit,
      });
      setDraft({
        anchorLifts: allSkipped ? [] : anchorLifts,
        anchorLiftsSkipped: allSkipped,
        preferredUnit: unit,
      });
      navigation.replace("Step3Schedule");
    } catch {
      setSaveError("Unable to save this step. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <OnboardingScaffold
      step={3}
      title="Help us calibrate your first workout"
      subtitle="Your weights will calibrate automatically as you log sessions - this just gives us a head start. Skip it any time."
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
      <PressableScale style={styles.skipLink} onPress={() => void saveSkipped()}>
        <Text style={styles.skipLinkText}>Skip this step -&gt;</Text>
      </PressableScale>

      <UnitToggle unit={unit} onSelect={handleUnitChange} />

      <View style={styles.rowsContainer}>
        {visibleFamilies.map((family, index) => (
          <React.Fragment key={family}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            <AnchorFamilyRow
              family={family}
              card={cardDrafts[family]}
              options={familyOptions[family]}
              unit={unit}
              levelKey={levelKey}
              onPatch={(partial) =>
                setCardDrafts((current) => ({
                  ...current,
                  [family]: { ...current[family], ...partial },
                }))
              }
            />
          </React.Fragment>
        ))}
      </View>

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  skipLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  skipLinkText: {
    color: colors.accent,
    ...typography.body,
  },
  unitToggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  unitChip: {
    minHeight: 42,
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  unitChipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  unitChipText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "700",
  },
  unitChipTextActive: {
    color: colors.textPrimary,
  },
  rowsContainer: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  anchorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  anchorLeft: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  anchorFamilyLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  weightInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  weightInput: {
    width: 72,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    textAlign: "center",
    textAlignVertical: "center",
    ...typography.body,
  },
  weightUnitLabel: {
    color: colors.textSecondary,
    ...typography.small,
    minWidth: 22,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  stepperCount: {
    minWidth: 24,
    textAlign: "center",
    color: colors.textPrimary,
    ...typography.body,
  },
  saveError: {
    color: colors.warning,
    ...typography.small,
  },
});
