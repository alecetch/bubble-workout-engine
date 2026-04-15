import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ProgressHeaderProps = {
  step: 1 | 2 | 3;
};

export function ProgressHeader({ step }: ProgressHeaderProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>{`Step ${step} of 3`}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${(step / 3) * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  stepLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  barTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
});
