import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";

type InlineRestStripProps = {
  restDisplaySeconds: number;
  restProgress: number;
  showAdjustControls: boolean;
  onToggleAdjust: () => void;
  onReset: () => void;
  onAdjust: (delta: number) => void;
  onAdjustLongPress: (delta: number) => void;
};

function formatRestTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function InlineRestStrip({
  restDisplaySeconds,
  restProgress,
  showAdjustControls,
  onToggleAdjust,
  onReset,
  onAdjust,
  onAdjustLongPress,
}: InlineRestStripProps): React.JSX.Element {
  return (
    <View style={styles.restStrip}>
      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.restStripLabel}>Rest</Text>
      <Text style={styles.restStripCountdown}>{formatRestTimer(restDisplaySeconds)}</Text>
      <View style={styles.restStripBarTrack}>
        <View style={[styles.restStripBarFill, { flex: restProgress }]} />
        <View style={{ flex: 1 - restProgress }} />
      </View>
      <PressableScale style={styles.restStripSkip} onPress={onReset}>
        <Text style={styles.restStripSkipLabel}>Reset</Text>
      </PressableScale>
      <PressableScale style={styles.restAdjustChip} onPress={onToggleAdjust}>
        <Text style={styles.restStripSkipLabel}>Adjust</Text>
      </PressableScale>
      {showAdjustControls ? (
        <View style={styles.restAdjustControls}>
          {[
            { label: "-", delta: -15, longDelta: -60 },
            { label: "+", delta: 15, longDelta: 60 },
          ].map((button) => (
            <PressableScale
              key={button.label}
              style={styles.restAdjustButton}
              onPress={() => onAdjust(button.delta)}
              onLongPress={() => onAdjustLongPress(button.longDelta)}
            >
              <Text style={styles.restStripSkipLabel}>{button.label}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  restStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  restStripLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  restStripCountdown: {
    color: colors.textPrimary,
    ...typography.small,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  restStripBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: colors.surface,
  },
  restStripBarFill: {
    backgroundColor: colors.accent,
  },
  restStripSkip: {
    alignSelf: "flex-start",
  },
  restStripSkipLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  restAdjustChip: {
    alignSelf: "flex-start",
  },
  restAdjustControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  restAdjustButton: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
