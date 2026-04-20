import * as DocumentPicker from "expo-document-picker";
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { SelectField } from "../../components/onboarding/SelectField";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { uploadTrainingHistoryCsv, type TrainingHistoryImportResult } from "../../api/trainingHistoryImport";
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

type Step2bMode = "known_weights" | "fitness_test" | "import_history";

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
  showSkipToggle?: boolean;
  hintText?: string | null;
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

function isCardComplete(card: CardDraft): boolean {
  if (card.skipped) return true;
  return Boolean(card.exerciseId && card.loadKgText.trim() && card.repsText.trim());
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

function ModeSelector({
  mode,
  onSelect,
}: {
  mode: Step2bMode;
  onSelect: (mode: Step2bMode) => void;
}): React.JSX.Element {
  const items: Array<{ value: Step2bMode; label: string }> = [
    { value: "known_weights", label: "Known weights" },
    { value: "fitness_test", label: "Test mode" },
    { value: "import_history", label: "Import history" },
  ];

  return (
    <SectionCard title="Choose a setup method" subtitle="You can switch between methods at any time.">
      <View style={styles.modeSelectorRow}>
        {items.map((item) => (
          <PressableScale
            key={item.value}
            style={[styles.modeChip, mode === item.value && styles.modeChipActive]}
            onPress={() => onSelect(item.value)}
          >
            <Text style={[styles.modeChipText, mode === item.value && styles.modeChipTextActive]}>
              {item.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </SectionCard>
  );
}

function AnchorFamilyCard({
  family,
  card,
  options,
  disabled,
  interacted,
  showSkipToggle = true,
  hintText,
  onPatch,
}: AnchorFamilyCardProps): React.JSX.Element {
  return (
    <SectionCard title={ESTIMATION_FAMILY_LABELS[family]}>
      {hintText ? <Text style={styles.helperCardText}>{hintText}</Text> : null}

      {showSkipToggle ? (
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
      ) : null}

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

  const [mode, setMode] = useState<Step2bMode>("known_weights");
  const [stepSkipped, setStepSkipped] = useState(false);
  const [cardDrafts, setCardDrafts] = useState<CardDraftMap>(makeDefaultDrafts);
  const [interactedFamilies, setInteractedFamilies] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fitnessTestIndex, setFitnessTestIndex] = useState(0);
  const [importResult, setImportResult] = useState<TrainingHistoryImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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

  const currentFitnessFamily = visibleFamilies[fitnessTestIndex] ?? null;
  const currentFitnessCard = currentFitnessFamily ? cardDrafts[currentFitnessFamily] : null;

  const fitnessLevelSlug = String(draft.fitnessLevel ?? "").trim().toLowerCase();
  const currentFitnessHint = currentFitnessFamily
    ? FITNESS_TEST_DEFAULTS[currentFitnessFamily]?.[fitnessLevelSlug]
    : null;

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

  function buildKnownWeightAnchors(): AnchorLiftEntry[] {
    return visibleFamilies.map((family) => {
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
  }

  function buildFitnessTestAnchors(): AnchorLiftEntry[] {
    return visibleFamilies.map((family) => {
      const card = cardDrafts[family];
      return {
        estimationFamily: family,
        exerciseId: card.skipped ? null : card.exerciseId,
        loadKg: card.skipped ? null : Number.parseFloat(card.loadKgText) || null,
        reps: card.skipped ? null : Number.parseInt(card.repsText, 10) || null,
        rir: card.skipped ? null : card.rir,
        skipped: card.skipped,
        source: "fitness_test",
        sourceDetailJson: card.skipped
          ? { method: "fitness_test", skipped: true }
          : {
              method: "fitness_test",
              reps_performed: Number.parseInt(card.repsText, 10) || null,
            },
      };
    });
  }

  async function saveManualMode(): Promise<void> {
    setAttempted("2b");
    setSaveError(null);

    const anchorLifts = buildKnownWeightAnchors();
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
  }

  async function finishFitnessTest(): Promise<void> {
    setAttempted("2b");
    setSaveError(null);

    const anchorLifts = buildFitnessTestAnchors();
    const effectiveStepSkipped = anchorLifts.every((entry) => entry.skipped);

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
      setSaveError("Unable to save this test data. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  }

  async function continueImportMode(): Promise<void> {
    if (!importResult) return;

    if (!profileId) {
      setImportError("Unable to continue right now. Please try again.");
      await hapticHeavy();
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        anchorLiftsSkipped: false,
      });
      setDraft({
        anchorLiftsSkipped: false,
        anchorLifts: importResult.derivedAnchorLifts.map((anchor) => ({
          estimationFamily: anchor.familySlug,
          exerciseId: null,
          loadKg: anchor.weightKg,
          reps: anchor.reps,
          rir: null,
          skipped: false,
          source: anchor.source,
          sourceDetailJson: { method: "history_import" },
        })),
      });
      navigation.replace("Step3Schedule");
    } catch {
      setImportError("Unable to continue right now. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  }

  async function skipImportStep(): Promise<void> {
    if (!profileId) {
      setImportError("Unable to save this step right now. Please try again.");
      await hapticHeavy();
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        anchorLifts: [],
        anchorLiftsSkipped: true,
      });
      setDraft({
        anchorLifts: [],
        anchorLiftsSkipped: true,
      });
      navigation.replace("Step3Schedule");
    } catch {
      setImportError("Unable to skip this step right now. Please try again.");
      await hapticHeavy();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImportPick(): Promise<void> {
    setImportError(null);
    setImportResult(null);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;

      const file = picked.assets[0];
      if (!file) return;

      setIsImporting(true);
      const result = await uploadTrainingHistoryCsv({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      });
      setImportResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import history.";
      setImportError(message);
      await hapticHeavy();
    } finally {
      setIsImporting(false);
    }
  }

  async function handleFitnessSkip(): Promise<void> {
    if (!currentFitnessFamily) return;
    handleCardPatch(currentFitnessFamily, {
      skipped: true,
      exerciseId: null,
      loadKgText: "",
      repsText: "",
      rir: null,
    });

    if (fitnessTestIndex >= visibleFamilies.length - 1) {
      await finishFitnessTest();
      return;
    }

    setFitnessTestIndex((current) => current + 1);
  }

  async function handleContinue(): Promise<void> {
    if (mode === "known_weights") {
      await saveManualMode();
      return;
    }

    if (mode === "fitness_test") {
      if (!currentFitnessFamily || !currentFitnessCard) {
        await finishFitnessTest();
        return;
      }

      setInteractedFamilies((current) => ({ ...current, [currentFitnessFamily]: true }));
      if (!isCardComplete(currentFitnessCard)) {
        setSaveError("Complete this test entry or skip it before continuing.");
        await hapticHeavy();
        return;
      }

      setSaveError(null);
      if (fitnessTestIndex >= visibleFamilies.length - 1) {
        await finishFitnessTest();
        return;
      }

      setFitnessTestIndex((current) => current + 1);
      return;
    }

    if (mode === "import_history") {
      await continueImportMode();
    }
  }

  const nextLabel =
    mode === "fitness_test"
      ? fitnessTestIndex >= visibleFamilies.length - 1
        ? "Save & Continue"
        : "Continue"
      : "Continue";

  const nextDisabled =
    isSaving ||
    referenceDataQuery.isLoading ||
    (mode === "import_history" && !importResult);

  return (
    <OnboardingScaffold
      step={3}
      title="Help us calibrate your first workout"
      subtitle="Choose the setup method that fits you best. You can enter known weights, run a quick fitness test, or import recent training history."
      errorBannerVisible={attemptedStep2b && Boolean(saveError)}
      onBack={handleBack}
      onNext={() => {
        void handleContinue();
      }}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      isSaving={isSaving || isImporting}
      scrollViewRef={scrollRef}
    >
      <ModeSelector
        mode={mode}
        onSelect={(nextMode) => {
          setMode(nextMode);
          setSaveError(null);
          setImportError(null);
          setImportResult(null);
          setFitnessTestIndex(0);
        }}
      />

      {mode === "known_weights" ? (
        <>
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
                We could not find any eligible anchor lifts for your current equipment setup. Continue and we will skip this step.
              </Text>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {mode === "fitness_test" ? (
        <>
          <SectionCard
            title="Fitness test mode"
            subtitle="Work through one anchor family at a time. Skip any lift you cannot estimate today."
          >
            {currentFitnessFamily ? (
              <Text style={styles.progressText}>
                {`Lift ${fitnessTestIndex + 1} of ${visibleFamilies.length}`}
              </Text>
            ) : (
              <Text style={styles.emptyText}>No eligible anchor lifts are available for your equipment.</Text>
            )}
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          </SectionCard>

          {currentFitnessFamily ? (
            <AnchorFamilyCard
              family={currentFitnessFamily}
              card={cardDrafts[currentFitnessFamily]}
              options={familyOptions[currentFitnessFamily]}
              disabled={false}
              interacted={Boolean(interactedFamilies[currentFitnessFamily])}
              showSkipToggle={false}
              hintText={
                currentFitnessHint
                  ? `Suggested test load: ${currentFitnessHint} kg. Start here if it feels sensible, then adjust based on warm-ups.`
                  : null
              }
              onPatch={(partial) => handleCardPatch(currentFitnessFamily, partial)}
            />
          ) : null}

          {currentFitnessFamily ? (
            <PressableScale style={styles.secondaryAction} onPress={() => void handleFitnessSkip()}>
              <Text style={styles.secondaryActionText}>Skip this lift</Text>
            </PressableScale>
          ) : null}
        </>
      ) : null}

      {mode === "import_history" ? (
        <>
          <SectionCard
            title="Import training history"
            subtitle="Upload a recent Hevy CSV and we will derive conservative starting anchors automatically."
          >
            <PressableScale
              style={[styles.primaryAction, isImporting && styles.primaryActionDisabled]}
              onPress={() => void handleImportPick()}
              disabled={isImporting}
            >
              {isImporting ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.primaryActionText}>Select CSV file</Text>
              )}
            </PressableScale>

            {importError ? <Text style={styles.saveError}>{importError}</Text> : null}
          </SectionCard>

          {importResult ? (
            <SectionCard title="Import summary" subtitle="Your anchor lifts were saved from this import.">
              <Text style={styles.summaryRow}>Rows processed: {importResult.summary.totalRows}</Text>
              <Text style={styles.summaryRow}>Derived anchors: {importResult.summary.derivedAnchors}</Text>
              <Text style={styles.summaryRow}>Warnings: {importResult.warnings.length}</Text>
              {importResult.derivedAnchorLifts.map((anchor) => (
                <Text key={`${anchor.familySlug}-${anchor.exerciseName ?? "unknown"}`} style={styles.summaryDetail}>
                  {`${ESTIMATION_FAMILY_LABELS[anchor.familySlug as EstimationFamily] ?? anchor.familySlug}: ${anchor.weightKg} kg x ${anchor.reps ?? "?"}${anchor.exerciseName ? ` (${anchor.exerciseName})` : ""}`}
                </Text>
              ))}
              {importResult.warnings.map((warning) => (
                <Text key={`${warning.code}-${warning.message}`} style={styles.warningDetail}>
                  {warning.message}
                </Text>
              ))}
            </SectionCard>
          ) : null}

          {importError ? (
            <SectionCard title="Other options">
              <PressableScale
                style={styles.secondaryAction}
                onPress={() => {
                  setMode("known_weights");
                  setImportError(null);
                }}
              >
                <Text style={styles.secondaryActionText}>Try Known weights</Text>
              </PressableScale>
              <PressableScale style={styles.secondaryAction} onPress={() => void skipImportStep()}>
                <Text style={styles.secondaryActionText}>Skip this step</Text>
              </PressableScale>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  modeSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  modeChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modeChipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  modeChipText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  modeChipTextActive: {
    color: colors.textPrimary,
  },
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
  helperCardText: {
    color: colors.textSecondary,
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
  progressText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  primaryActionDisabled: {
    opacity: 0.7,
  },
  primaryActionText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryAction: {
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  summaryRow: {
    color: colors.textPrimary,
    ...typography.body,
  },
  summaryDetail: {
    color: colors.textSecondary,
    ...typography.small,
  },
  warningDetail: {
    color: colors.warning,
    ...typography.small,
  },
});
