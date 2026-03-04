import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { RingTimer } from "./RingTimer";
import { useSegmentTimer } from "./useSegmentTimer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type PremiumTimerProps = {
  initialDurationSeconds?: number | null;
  suggestedRestSeconds?: number | null;
  segmentId?: string;
};

const RING_SIZE = 200;
const STROKE_WIDTH = 8;
const TRACK_COLOR = "rgba(148, 163, 184, 0.12)";

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function PremiumTimer({
  initialDurationSeconds = null,
  suggestedRestSeconds = null,
  segmentId,
}: PremiumTimerProps): React.JSX.Element {
  const resolvedSegmentId = segmentId ?? "__transient__";
  const restTotal = suggestedRestSeconds != null && suggestedRestSeconds > 0
    ? suggestedRestSeconds
    : 60;
  const hasRestProp = suggestedRestSeconds != null && suggestedRestSeconds > 0;

  const {
    activeMode,
    displaySeconds,
    progress,
    ringColor,
    isRunning,
    segmentFinished,
    restFinished,
    hasRest,
    canSwitchToRest,
    onStartPause,
    onReset,
    onSwitchMode,
  } = useSegmentTimer({
    segmentId: resolvedSegmentId,
    segmentTotal: initialDurationSeconds,
    restTotal,
  });

  const startPauseLabel = isRunning ? "Pause" : (segmentFinished && activeMode === "segment" ? "Done" : "Start");
  const modeBadgeLabel = activeMode === "segment"
    ? (initialDurationSeconds == null ? "STOPWATCH" : "SEGMENT")
    : "REST";
  const modeChipLabel = activeMode === "segment" ? "Rest" : "Back";
  const stateHint = segmentFinished && activeMode === "segment" && !hasRestProp ? "Done!"
    : restFinished && activeMode === "rest" ? "Rest done!"
    : "";

  const modeChipDisabled = !hasRestProp || !hasRest || (activeMode === "segment" && !canSwitchToRest);

  return (
    <View style={styles.card}>
      <View style={styles.ringContainer}>
        <RingTimer
          size={RING_SIZE}
          strokeWidth={STROKE_WIDTH}
          progress={progress}
          trackColor={TRACK_COLOR}
          progressColor={ringColor}
        >
          <View style={styles.centerOverlay}>
            {hasRestProp ? (
              <PressableScale
                onPress={onSwitchMode}
                disabled={modeChipDisabled}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={activeMode === "segment" ? "Switch to rest mode" : "Switch to segment mode"}
                style={[
                  styles.modeChip,
                  activeMode === "rest" && styles.modeChipRest,
                  modeChipDisabled && styles.modeChipDisabled,
                ]}
              >
                <Text style={styles.modeChipLabel}>{modeChipLabel}</Text>
              </PressableScale>
            ) : (
              <View style={styles.modeChipSpacer} />
            )}

            <Text style={styles.timeDisplay} accessibilityLabel={`${modeBadgeLabel} ${formatTimer(displaySeconds)} remaining`}>
              {formatTimer(displaySeconds)}
            </Text>

            {stateHint ? (
              <Text style={styles.stateHint}>{stateHint}</Text>
            ) : (
              <View style={styles.modeChipSpacer} />
            )}
          </View>
        </RingTimer>
      </View>

      <View style={styles.controlsRow}>
        <PressableScale
          style={[
            styles.button,
            styles.buttonPrimary,
            (segmentFinished && activeMode === "segment" && !hasRestProp) && styles.buttonDisabled,
          ]}
          onPress={onStartPause}
          disabled={segmentFinished && activeMode === "segment" && !hasRestProp}
          accessibilityLabel={isRunning
            ? (activeMode === "segment" ? "Pause segment timer" : "Pause rest timer")
            : (activeMode === "segment" ? "Start segment timer" : "Start rest timer")}
        >
          <Text style={styles.buttonLabel}>{startPauseLabel}</Text>
        </PressableScale>

        <PressableScale
          style={[styles.button, styles.buttonSecondary]}
          onPress={onReset}
          accessibilityLabel={activeMode === "segment" ? "Reset segment timer" : "Reset rest timer"}
        >
          <Text style={styles.buttonLabel}>Reset</Text>
        </PressableScale>
      </View>
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
    alignItems: "center",
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  centerOverlay: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  modeChip: {
    minHeight: 28,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: "rgba(34,197,94,0.12)",
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipRest: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  modeChipDisabled: {
    opacity: 0.35,
  },
  modeChipLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modeChipSpacer: {
    height: 28,
  },
  timeDisplay: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    includeFontPadding: false,
  },
  stateHint: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: "center",
  },
  controlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
});
