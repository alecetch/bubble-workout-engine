import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { addBonusDay } from "../../api/bonusDayApi";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const FOCUS_LABELS: Record<string, string> = {
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  full_body: "Full Body",
  upper: "Upper",
  lower: "Lower",
  full: "Full Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  hyrox: "Hyrox / Conditioning",
  conditioning: "Conditioning",
};

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

type SelectedBonusType = {
  programType: string;
  focusType: string | null;
};

type BonusWorkoutSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCreated: (programDayId: string) => void;
  programId: string;
  todayIso: string;
  todayWeekday: string;
  currentProgramType: string;
  currentFocusTypes: string[];
  recommendedFocusType?: string | null;
};

function labelForFocus(focusType: string): string {
  return FOCUS_LABELS[focusType] ?? focusType.replace(/[_-]+/g, " ");
}

export function BonusWorkoutSheet({
  visible,
  onClose,
  onCreated,
  programId,
  todayIso,
  todayWeekday,
  currentProgramType,
  currentFocusTypes,
  recommendedFocusType,
}: BonusWorkoutSheetProps): React.JSX.Element {
  const [step, setStep] = useState<"type" | "scope">("type");
  const [selected, setSelected] = useState<SelectedBonusType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("type");
      setSelected(null);
      setIsSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const weekdayLabel = WEEKDAY_LABELS[todayWeekday] ?? "this day";
  const alternateTypes = useMemo(
    () =>
      [
        { programType: "strength", focusType: null, label: "Strength" },
        { programType: "hyrox", focusType: null, label: "Hyrox / Conditioning" },
      ].filter((option) => option.programType !== currentProgramType),
    [currentProgramType],
  );

  async function handleSubmit(scope: "today" | "weekday_recurring"): Promise<void> {
    if (!selected || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await addBonusDay(programId, {
        focusType: selected.focusType,
        programType: selected.programType,
        scope,
        targetDate: todayIso,
        weekday: todayWeekday,
      });
      onCreated(result.programDayId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create bonus workout.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <PressableScale
          testID="bonus-sheet-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close bonus workout sheet"
        >
          <View />
        </PressableScale>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {step === "type" ? (
            <>
              <Text style={styles.title}>Bonus workout</Text>
              <Text style={styles.sectionLabel}>More of today&apos;s program</Text>
              {currentFocusTypes.map((focusType) => {
                const isSelected =
                  selected?.programType === currentProgramType && selected.focusType === focusType;
                return (
                  <PressableScale
                    key={focusType}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    onPress={() => setSelected({ programType: currentProgramType, focusType })}
                  >
                    <View style={styles.radioCircle}>
                      {isSelected ? <View style={styles.radioFill} /> : null}
                    </View>
                    <Text style={styles.optionLabel}>
                      {PROGRAM_TYPE_LABELS[currentProgramType] ?? currentProgramType}
                      {" - "}
                      {labelForFocus(focusType)}
                    </Text>
                    {focusType === recommendedFocusType ? (
                      <Text style={styles.recommendedTag}>(Recommended)</Text>
                    ) : null}
                  </PressableScale>
                );
              })}

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Something different</Text>
              {alternateTypes.map((option) => {
                const isSelected =
                  selected?.programType === option.programType && selected.focusType === null;
                return (
                  <PressableScale
                    key={option.programType}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    onPress={() =>
                      setSelected({ programType: option.programType, focusType: option.focusType })
                    }
                  >
                    <View style={styles.radioCircle}>
                      {isSelected ? <View style={styles.radioFill} /> : null}
                    </View>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                  </PressableScale>
                );
              })}

              <PressableScale
                style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
                onPress={() => selected && setStep("scope")}
                disabled={!selected}
              >
                <Text style={styles.confirmLabel}>Confirm</Text>
              </PressableScale>
            </>
          ) : (
            <>
              <Text style={styles.title}>Add this workout...</Text>
              <PressableScale style={styles.scopeCard} onPress={() => void handleSubmit("today")}>
                <Text style={styles.scopeTitle}>Just today</Text>
                <Text style={styles.scopeCopy}>One extra session added for today only.</Text>
              </PressableScale>
              <PressableScale
                style={styles.scopeCard}
                onPress={() => void handleSubmit("weekday_recurring")}
              >
                <Text style={styles.scopeTitle}>Every {weekdayLabel} from now on</Text>
                <Text style={styles.scopeCopy}>
                  Adds this workout to every {weekdayLabel} for the rest of the program.
                </Text>
              </PressableScale>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {isSubmitting ? <ActivityIndicator color={colors.accent} /> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,6,23,0.62)",
  },
  sheet: {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  sectionLabel: {
    color: colors.textSecondary,
    ...typography.label,
    marginTop: spacing.xs,
  },
  optionRow: {
    minHeight: 50,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionRowSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(56,189,248,0.12)",
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  radioFill: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  optionLabel: {
    color: colors.textPrimary,
    ...typography.body,
    flex: 1,
  },
  recommendedTag: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  confirmButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  scopeCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scopeTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  scopeCopy: {
    color: colors.textSecondary,
    ...typography.small,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
});
