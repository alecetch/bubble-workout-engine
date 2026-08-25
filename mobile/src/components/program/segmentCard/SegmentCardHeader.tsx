import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";

type SegmentCardHeaderProps = {
  segmentName: string;
  segmentTypeBadgeLabel: string | null;
  notesText: string | null;
  initialDurationSeconds: number | null;
  secondsLeft: number;
  timerRunning: boolean;
  onTimerPress: () => void;
  isLogged: boolean;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SegmentCardHeader({
  segmentName,
  segmentTypeBadgeLabel,
  notesText,
  initialDurationSeconds,
  secondsLeft,
  timerRunning,
  onTimerPress,
  isLogged,
}: SegmentCardHeaderProps): React.JSX.Element {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.segmentName}>{segmentName}</Text>
        {segmentTypeBadgeLabel ? (
          <View style={styles.segmentTypeBadge}>
            <Text style={styles.segmentTypeBadgeText}>{segmentTypeBadgeLabel}</Text>
          </View>
        ) : null}
        {notesText ? (
          <Text style={styles.segmentMeta} numberOfLines={3} ellipsizeMode="tail">
            {notesText}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        {initialDurationSeconds != null && initialDurationSeconds > 0 ? (
          <PressableScale
            style={styles.durationChip}
            accessibilityLabel={timerRunning ? "Pause segment timer" : "Start segment timer"}
            onPress={onTimerPress}
          >
            <Ionicons
              name={timerRunning ? "pause-circle-outline" : "time-outline"}
              size={13}
              color={timerRunning ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.durationText, timerRunning && styles.durationTextRunning]}>
              {formatDuration(secondsLeft)}
            </Text>
          </PressableScale>
        ) : null}
        <View style={[styles.loggedBadge, !isLogged && styles.loggedBadgeHidden]}>
          <Text style={styles.loggedText}>Logged</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  durationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  durationText: {
    color: colors.textSecondary,
    ...typography.label,
    fontVariant: ["tabular-nums"],
  },
  durationTextRunning: {
    color: colors.accent,
    fontWeight: "700",
  },
  segmentName: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  segmentMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  segmentTypeBadge: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  segmentTypeBadgeText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  loggedBadge: {
    borderRadius: radii.pill,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  loggedBadgeHidden: {
    opacity: 0,
  },
  loggedText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
  },
});
