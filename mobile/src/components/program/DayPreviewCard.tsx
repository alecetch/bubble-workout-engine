import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type DayPreview = {
  programDayId?: string;
  label?: string;
  type?: string;
  sessionDuration?: number;
  equipmentSlugs?: string[];
};

type DayPreviewCardProps = {
  preview?: DayPreview;
  onStartWorkout: () => void;
};

export function DayPreviewCard({ preview, onStartWorkout }: DayPreviewCardProps): React.JSX.Element {
  const hasProgramDay = Boolean(preview?.programDayId);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Day Preview</Text>
      <Text style={styles.rowLabel}>Label</Text>
      <Text style={styles.rowValue}>{preview?.label || "Select a scheduled workout day."}</Text>
      <Text style={styles.rowLabel}>Type</Text>
      <Text style={styles.rowValue}>{preview?.type || "Not set"}</Text>
      <Text style={styles.rowLabel}>Duration</Text>
      <Text style={styles.rowValue}>
        {typeof preview?.sessionDuration === "number" ? `${preview.sessionDuration} min` : "Not set"}
      </Text>

      <Text style={styles.rowLabel}>Equipment</Text>
      <View style={styles.chipsWrap}>
        {preview?.equipmentSlugs && preview.equipmentSlugs.length > 0 ? (
          preview.equipmentSlugs.map((slug) => (
            <View key={slug} style={styles.chip}>
              <Text style={styles.chipLabel}>{slug}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.rowValue}>Not set</Text>
        )}
      </View>

      <PressableScale style={[styles.startButton, !hasProgramDay && styles.startButtonDisabled]} onPress={onStartWorkout} disabled={!hasProgramDay}>
        <Text style={styles.startButtonLabel}>Start workout</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  rowLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  startButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
