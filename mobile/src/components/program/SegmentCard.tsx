import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { PressableScale } from "../interaction/PressableScale";
import { PremiumTimer } from "../timers/PremiumTimer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Segment = ProgramDayFullResponse["segments"][number];

type SegmentCardProps = {
  segment: Segment;
  isLogged: boolean;
  onLogSegment: (segment: Segment) => void;
};

function parseMmssToSeconds(value?: string | null): number | null {
  if (!value) return null;
  const [mm, ss] = value.split(":");
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function isLoggableSegment(segmentName: string): boolean {
  const normalized = segmentName.toLowerCase();
  if (normalized.includes("warm-up") || normalized.includes("warm up")) return false;
  if (normalized.includes("cool-down") || normalized.includes("cooldown")) return false;
  return true;
}

export function SegmentCard({ segment, isLogged, onLogSegment }: SegmentCardProps): React.JSX.Element {
  const loggable = isLoggableSegment(segment.segmentName);
  const initialDurationSeconds =
    segment.segmentDurationSeconds ?? parseMmssToSeconds(segment.segmentDurationMmss);

  const suggestedRestSeconds = useMemo(() => {
    const withRest = segment.exercises
      .map((exercise) => exercise.restSeconds)
      .filter((value): value is number => typeof value === "number");
    if (withRest.length === 0) return null;
    return Math.max(...withRest);
  }, [segment.exercises]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.segmentName}>{segment.segmentName}</Text>
          {segment.segmentDurationMmss ? <Text style={styles.segmentMeta}>{segment.segmentDurationMmss}</Text> : null}
        </View>
        {isLogged ? <View style={styles.loggedBadge}><Text style={styles.loggedText}>Logged</Text></View> : null}
      </View>

      <PremiumTimer initialDurationSeconds={initialDurationSeconds} suggestedRestSeconds={suggestedRestSeconds} />

      <View style={styles.exerciseList}>
        {segment.exercises.map((exercise, index) => {
          const line2 = [
            exercise.sets != null ? `${exercise.sets} set${exercise.sets !== 1 ? "s" : ""}` : null,
            exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : null,
            exercise.intensity ?? null,
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <View key={exercise.id ?? `${segment.id}-exercise-${index}`} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              {line2 ? <Text style={styles.exerciseMeta}>{line2}</Text> : null}
              {exercise.restSeconds != null && exercise.restSeconds > 0 ? (
                <View style={styles.restRow}>
                  <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {loggable ? (
        <PressableScale style={styles.logButton} onPress={() => onLogSegment(segment)}>
          <Text style={styles.logButtonLabel}>Log segment</Text>
        </PressableScale>
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
    gap: spacing.md,
  },
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
  segmentName: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  segmentMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  loggedBadge: {
    borderRadius: radii.pill,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  loggedText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
  },
  exerciseList: {
    gap: spacing.sm,
  },
  exerciseRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: 2,
  },
  exerciseName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  exerciseMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});