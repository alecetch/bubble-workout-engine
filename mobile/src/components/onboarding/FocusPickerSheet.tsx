import React from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii, shadows } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const BASE_OPTIONS = ["full_body", "upper_body", "lower_body"];
const PPL_OPTIONS = ["full_body", "upper_body", "lower_body", "push", "pull", "legs"];

const FOCUS_LABELS: Record<string, string> = {
  full_body: "Full Body",
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

type FocusPickerSheetProps = {
  visible: boolean;
  currentFocus: string;
  programType: string;
  daysPerWeek: number;
  onSelect: (focus: string) => void;
  onClose: () => void;
};

export function FocusPickerSheet({
  visible,
  currentFocus,
  programType,
  daysPerWeek,
  onSelect,
  onClose,
}: FocusPickerSheetProps): React.JSX.Element {
  const options = programType === "hypertrophy" && daysPerWeek >= 5 ? PPL_OPTIONS : BASE_OPTIONS;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>Choose focus</Text>
            <Text style={styles.subtitle}>Pick the training focus for this day.</Text>
            <View style={styles.options}>
              {options.map((option) => {
                const selected = currentFocus === option;
                return (
                  <PressableScale
                    key={option}
                    testID={`focus-option-${option}`}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => {
                      onSelect(option);
                      onClose();
                    }}
                  >
                    <Text style={styles.optionLabel}>{FOCUS_LABELS[option]}</Text>
                    {selected ? <Text style={styles.check}>Check</Text> : null}
                  </PressableScale>
                );
              })}
            </View>
            <PressableScale style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>Cancel</Text>
            </PressableScale>
          </View>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    minHeight: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  optionSelected: {
    borderColor: colors.accent,
  },
  optionLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  check: {
    color: colors.success,
    ...typography.small,
    fontWeight: "700",
  },
  closeButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
