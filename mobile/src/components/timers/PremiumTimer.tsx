import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { useCountdownTimer } from "./useCountdownTimer";

type PremiumTimerProps = {
  initialDurationSeconds?: number | null;
  suggestedRestSeconds?: number | null;
};

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export function PremiumTimer({
  initialDurationSeconds = null,
  suggestedRestSeconds = null,
}: PremiumTimerProps): React.JSX.Element {
  const segmentTimer = useCountdownTimer({ initialSeconds: initialDurationSeconds });
  const restDuration = suggestedRestSeconds ?? 60;
  const restTimer = useCountdownTimer({ initialSeconds: restDuration });

  const [restMode, setRestMode] = useState(false);

  const displaySeconds = restMode ? restTimer.displaySeconds : segmentTimer.displaySeconds;
  const displayLabel = restMode ? "REST" : "SEGMENT";
  const primaryTimer = restMode ? restTimer : segmentTimer;

  const subtitle = useMemo(() => {
    if (initialDurationSeconds == null) return "Stopwatch mode";
    return "Countdown mode";
  }, [initialDurationSeconds]);

  const handleStartPause = (): void => {
    if (primaryTimer.isRunning) {
      primaryTimer.pause();
      return;
    }
    primaryTimer.start();
  };

  const handleReset = (): void => {
    primaryTimer.reset();
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{displayLabel}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Text style={styles.timeValue}>{formatTimer(displaySeconds)}</Text>

      <View style={styles.controlsRow}>
        <PressableScale style={styles.controlButton} onPress={handleStartPause}>
          <Text style={styles.controlLabel}>{primaryTimer.isRunning ? "Pause" : "Start"}</Text>
        </PressableScale>
        <PressableScale style={styles.controlButtonSecondary} onPress={handleReset}>
          <Text style={styles.controlLabel}>Reset</Text>
        </PressableScale>
        <PressableScale
          style={[styles.controlButtonSecondary, restMode && styles.restActiveButton]}
          onPress={() => setRestMode((current) => !current)}
        >
          <Text style={styles.controlLabel}>{restMode ? "Back" : "Rest"}</Text>
        </PressableScale>
      </View>

      {restMode ? (
        <Text style={styles.restHint}>
          Segment timer continues independently while rest timer is active.
        </Text>
      ) : null}
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
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.small,
  },
  timeValue: {
    color: colors.textPrimary,
    ...typography.h1,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  controlButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  controlButtonSecondary: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restActiveButton: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  controlLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  restHint: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
