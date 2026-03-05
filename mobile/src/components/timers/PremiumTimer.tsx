import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  compact?: boolean;
};

const RING_SIZE = 200;
const STROKE_WIDTH = 8;
const TRACK_COLOR = "rgba(148, 163, 184, 0.12)";
const COMPACT_RING_SIZE = 96;
const COMPACT_STROKE_WIDTH = 6;

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function PremiumTimer({
  initialDurationSeconds = null,
  suggestedRestSeconds = null,
  segmentId,
  compact = false,
}: PremiumTimerProps): React.JSX.Element {
  const [resetHighlighted, setResetHighlighted] = useState(false);
  const resetHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedSegmentId = segmentId ?? "__transient__";
  const restTotal = suggestedRestSeconds != null && suggestedRestSeconds > 0
    ? suggestedRestSeconds
    : 60;
  const hasRestProp = suggestedRestSeconds != null && suggestedRestSeconds > 0;
  const ringSize = compact ? COMPACT_RING_SIZE : RING_SIZE;
  const strokeWidth = compact ? COMPACT_STROKE_WIDTH : STROKE_WIDTH;

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

  const modeBadgeLabel = activeMode === "segment"
    ? (initialDurationSeconds == null ? "STOPWATCH" : "SEGMENT")
    : "REST";
  const modeChipLabel = activeMode === "segment" ? "Rest" : "Back";
  const stateHint = segmentFinished && activeMode === "segment" && !hasRestProp ? "Done!"
    : restFinished && activeMode === "rest" ? "Rest done!"
    : "";

  const modeChipDisabled = !hasRestProp || !hasRest || (activeMode === "segment" && !canSwitchToRest);

  useEffect(() => {
    return () => {
      if (resetHighlightTimeoutRef.current) {
        clearTimeout(resetHighlightTimeoutRef.current);
      }
    };
  }, []);

  const handleResetPress = (): void => {
    onReset();
    setResetHighlighted(true);
    if (resetHighlightTimeoutRef.current) {
      clearTimeout(resetHighlightTimeoutRef.current);
    }
    resetHighlightTimeoutRef.current = setTimeout(() => {
      setResetHighlighted(false);
    }, 1000);
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={compact ? styles.ringContainerCompact : styles.ringContainer}>
        <RingTimer
          size={ringSize}
          strokeWidth={strokeWidth}
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
                  compact && styles.modeChipCompact,
                ]}
              >
                <Text style={[styles.modeChipLabel, compact && styles.modeChipLabelCompact]}>{modeChipLabel}</Text>
              </PressableScale>
            ) : (
              <View style={[styles.modeChipSpacer, compact && styles.modeChipSpacerCompact]} />
            )}

            <Text style={[styles.timeDisplay, compact && styles.timeDisplayCompact]} accessibilityLabel={`${modeBadgeLabel} ${formatTimer(displaySeconds)} remaining`}>
              {formatTimer(displaySeconds)}
            </Text>

            {stateHint ? (
              <Text style={styles.stateHint}>{stateHint}</Text>
            ) : (
              <View style={[styles.modeChipSpacer, compact && styles.modeChipSpacerCompact]} />
            )}
          </View>
        </RingTimer>
      </View>

      <View style={[styles.controlsRow, compact && styles.controlsRowCompact]}>
        <PressableScale
          style={[
            styles.button,
            styles.buttonPrimary,
            compact && styles.buttonCompact,
            (segmentFinished && activeMode === "segment" && !hasRestProp) && styles.buttonDisabled,
          ]}
          onPress={onStartPause}
          disabled={segmentFinished && activeMode === "segment" && !hasRestProp}
          accessibilityLabel={isRunning
            ? (activeMode === "segment" ? "Pause segment timer" : "Pause rest timer")
            : (activeMode === "segment" ? "Start segment timer" : "Start rest timer")}
        >
          <Ionicons
            name={isRunning ? "pause" : "play"}
            size={compact ? 20 : 26}
            color={colors.textPrimary}
          />
        </PressableScale>

        <PressableScale
          style={[
            styles.button,
            styles.buttonSecondary,
            compact && styles.buttonCompact,
            resetHighlighted && styles.resetButtonHighlighted,
          ]}
          onPress={handleResetPress}
          accessibilityLabel={activeMode === "segment" ? "Reset segment timer" : "Reset rest timer"}
        >
          <Ionicons
            name="refresh-outline"
            size={compact ? 16 : 22}
            color={colors.textSecondary}
          />
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
    justifyContent: "center",
    gap: spacing.md,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  resetButtonHighlighted: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  cardCompact: {
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
    gap: spacing.xs,
  },
  ringContainerCompact: {
    width: COMPACT_RING_SIZE,
    height: COMPACT_RING_SIZE,
  },
  modeChipCompact: {
    minHeight: 20,
    paddingHorizontal: spacing.xs,
  },
  modeChipLabelCompact: {
    fontSize: 10,
  },
  modeChipSpacerCompact: {
    height: 20,
  },
  timeDisplayCompact: {
    fontSize: 22,
  },
  controlsRowCompact: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  buttonCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
