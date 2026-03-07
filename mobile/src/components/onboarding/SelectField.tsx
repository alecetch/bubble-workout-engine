import React, { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii, shadows } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  label: string;
  valueLabel?: string;
  placeholder: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  error?: string;
};

export function SelectField({
  label,
  valueLabel,
  placeholder,
  options,
  onSelect,
  error,
}: SelectFieldProps): React.JSX.Element {
  const [androidOpen, setAndroidOpen] = useState(false);

  const optionLabels = useMemo(() => options.map((opt) => opt.label), [options]);

  const openPicker = (): void => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...optionLabels, "Cancel"],
          cancelButtonIndex: optionLabels.length,
          title: label,
        },
        (buttonIndex) => {
          if (buttonIndex >= 0 && buttonIndex < options.length) {
            onSelect(options[buttonIndex].value);
          }
        },
      );
      return;
    }

    setAndroidOpen(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <PressableScale style={[styles.trigger, !!error && styles.triggerError]} onPress={openPicker}>
        <Text style={valueLabel ? styles.valueText : styles.placeholderText}>
          {valueLabel || placeholder}
        </Text>
      </PressableScale>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={androidOpen} transparent animationType="fade" onRequestClose={() => setAndroidOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <View style={styles.modalOptions}>
              {options.map((option) => (
                <PressableScale
                  key={option.value}
                  style={styles.modalOption}
                  onPress={() => {
                    onSelect(option.value);
                    setAndroidOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </PressableScale>
              ))}
            </View>
            <PressableScale style={styles.cancelButton} onPress={() => setAndroidOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    ...typography.label,
  },
  trigger: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  triggerError: {
    borderColor: colors.warning,
  },
  valueText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  placeholderText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  error: {
    color: colors.warning,
    ...typography.small,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card,
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  modalOptions: {
    gap: spacing.sm,
  },
  modalOption: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalOptionText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  cancelButton: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
