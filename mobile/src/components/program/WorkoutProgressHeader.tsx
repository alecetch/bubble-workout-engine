import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type WorkoutProgressHeaderProps = {
  completedExercises: number;
  totalExercises: number;
  loggedSets: number;
  totalSets: number;
  startedAtMs: number | null;
  onJumpToNext?: () => void;
  showJumpToNext: boolean;
  onLayout?: (height: number) => void;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function WorkoutProgressHeader({
  completedExercises,
  totalExercises,
  loggedSets,
  totalSets,
  startedAtMs,
  onJumpToNext,
  showJumpToNext,
  onLayout,
}: WorkoutProgressHeaderProps): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs == null) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  const elapsedLabel = startedAtMs != null ? formatElapsed(nowMs - startedAtMs) : null;

  return (
    <View
      style={styles.root}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
      testID="workout-progress-header"
    >
      <View style={styles.statsRow}>
        <Text style={styles.statText}>{`${completedExercises} of ${totalExercises} exercises`}</Text>
        <Text style={styles.statDivider}>/</Text>
        <Text style={styles.statText}>{`${loggedSets} of ${totalSets} sets`}</Text>
        {elapsedLabel ? (
          <>
            <Text style={styles.statDivider}>/</Text>
            <Text style={styles.statText}>{elapsedLabel}</Text>
          </>
        ) : null}
      </View>
      {showJumpToNext && onJumpToNext ? (
        <PressableScale style={styles.jumpButton} onPress={onJumpToNext} accessibilityLabel="Jump to next exercise">
          <Text style={styles.jumpButtonLabel}>Next</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  statText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  statDivider: {
    color: colors.textSecondary,
    ...typography.small,
  },
  jumpButton: {
    minHeight: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
});
