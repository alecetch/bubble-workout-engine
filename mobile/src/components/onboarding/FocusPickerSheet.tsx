import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export const FOCUS_LABELS: Record<string, string> = {
  full_body: "Full Body",
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

const BASE_OPTIONS = ["full_body", "upper_body", "lower_body"];
const PPL_OPTIONS = ["full_body", "upper_body", "lower_body", "push", "pull", "legs"];

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
  const options =
    programType === "hypertrophy" && daysPerWeek >= 5 ? PPL_OPTIONS : BASE_OPTIONS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Choose focus</Text>
          <ScrollView>
            {options.map((option) => (
              <PressableScale
                key={option}
                style={[
                  styles.optionRow,
                  currentFocus === option && styles.optionRowSelected,
                ]}
                onPress={() => {
                  onSelect(option);
                  onClose();
                }}
              >
                <Text style={[
                  styles.optionLabel,
                  currentFocus === option && styles.optionLabelSelected,
                ]}>
                  {FOCUS_LABELS[option] ?? option}
                </Text>
                {currentFocus === option ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </PressableScale>
            ))}
          </ScrollView>
          <PressableScale style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </PressableScale>
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: "60%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionRowSelected: {
    backgroundColor: "rgba(59,130,246,0.08)",
  },
  optionLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  optionLabelSelected: {
    color: colors.accent,
    fontWeight: "600",
  },
  checkmark: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "700",
  },
  cancelButton: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});
