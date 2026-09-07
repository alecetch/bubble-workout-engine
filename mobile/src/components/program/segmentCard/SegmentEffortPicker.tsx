import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";
import { RIR_OPTIONS } from "./RirRoundPicker";

type SegmentEffortPickerProps = {
  selectedValue: number | null;
  onSelect: (optionValue: number) => void;
};

export function SegmentEffortPicker({
  selectedValue,
  onSelect,
}: SegmentEffortPickerProps): React.JSX.Element {
  return (
    <View style={styles.rirPills} testID="segment-effort-picker">
      {RIR_OPTIONS.map((option) => {
        const optionValue = option === "4+" ? 4 : Number(option);
        const selected = selectedValue === optionValue;
        return (
          <PressableScale
            key={option}
            containerStyle={styles.rirPillContainer}
            style={[styles.rirPill, selected && styles.rirPillSelected]}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            accessibilityLabel={`Superset effort ${option}`}
            onPress={() => onSelect(optionValue)}
          >
            <Text style={[styles.rirPillLabel, selected && styles.rirPillLabelSelected]}>
              {option}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rirPills: {
    flexDirection: "row",
    width: "100%",
    gap: spacing.xs,
  },
  rirPillContainer: {
    flex: 1,
  },
  rirPill: {
    width: "100%",
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rirPillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rirPillLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    lineHeight: 20,
    fontWeight: "600",
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  rirPillLabelSelected: {
    color: colors.textPrimary,
  },
});
