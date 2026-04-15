import React from "react";
import { StyleSheet, Text } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { hapticLight } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function Pill({ label, selected, onPress, disabled = false }: PillProps): React.JSX.Element {
  const handlePress = async (): Promise<void> => {
    if (disabled) return;
    await hapticLight();
    onPress();
  };

  return (
    <PressableScale
      style={[styles.pill, selected && styles.pillSelected, disabled && styles.disabled]}
      onPress={() => {
        void handlePress();
      }}
      disabled={disabled}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  pillSelected: {
    backgroundColor: "rgba(59,130,246,0.28)",
    borderColor: colors.accent,
  },
  label: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "500",
    width: "100%",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  labelSelected: {
    color: colors.textPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
