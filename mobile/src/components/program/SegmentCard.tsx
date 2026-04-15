import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { PressableScale } from "../interaction/PressableScale";
import { GuidelineLoadHint } from "./GuidelineLoadHint";
import { AdaptationChip } from "./AdaptationChip";
import { PremiumTimer } from "../timers/PremiumTimer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { getSegmentPresentation } from "./segmentCardLogic";

type Segment = ProgramDayFullResponse["segments"][number];

type SegmentCardProps = {
  segment: Segment;
  isLogged: boolean;
  onLogSegment: (segment: Segment) => void;
  onViewDecisionHistory?: (
    exerciseId: string,
    exerciseName: string,
    programExerciseId: string,
  ) => void;
};

const BADGE_SEGMENT_TYPES = new Set(["single", "superset", "giant_set", "amrap", "emom"]);

function parseMmssToSeconds(value?: string | null): number | null {
  if (!value) return null;
  const [mm, ss] = value.split(":");
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function roundToNearestMinute(seconds: number | null): number | null {
  if (seconds == null) return null;
  // Rounds up only when remainder > 30 s (17:30 → 17:00, 17:31 → 18:00).
  return seconds % 60 > 30
    ? Math.ceil(seconds / 60) * 60
    : Math.floor(seconds / 60) * 60;
}

export function SegmentCard({
  segment,
  isLogged,
  onLogSegment,
  onViewDecisionHistory,
}: SegmentCardProps): React.JSX.Element {
  const presentation = getSegmentPresentation({
    segmentType: segment.segmentType,
    rounds: segment.rounds,
    notes: segment.notes,
    exercises: segment.exercises,
  });
  const initialDurationSeconds = roundToNearestMinute(
    segment.segmentDurationSeconds ?? parseMmssToSeconds(segment.segmentDurationMmss),
  );
  const exercises = Array.isArray(segment.exercises) ? segment.exercises : [];
  const segmentTypeBadgeLabel =
    segment.segmentType &&
    BADGE_SEGMENT_TYPES.has(segment.segmentType) &&
    typeof segment.segmentTypeLabel === "string" &&
    segment.segmentTypeLabel.trim()
      ? segment.segmentTypeLabel
      : null;

  const suggestedRestSeconds = useMemo(() => {
    const withRest = exercises
      .map((exercise) => exercise.restSeconds)
      .filter((value): value is number => typeof value === "number");
    if (withRest.length === 0) return null;
    return Math.max(...withRest);
  }, [exercises]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.segmentName}>{segment.segmentName}</Text>
          {segmentTypeBadgeLabel ? (
            <View style={styles.segmentTypeBadge}>
              <Text style={styles.segmentTypeBadgeText}>{segmentTypeBadgeLabel}</Text>
            </View>
          ) : null}
          {!presentation.isWarmupOrCooldown && presentation.segmentHasExercises && String(segment.notes ?? "").trim() ? (
            <Text style={styles.segmentMeta} numberOfLines={3} ellipsizeMode="tail">
              {String(segment.notes).trim()}
            </Text>
          ) : null}
        </View>
        {isLogged ? <View style={styles.loggedBadge}><Text style={styles.loggedText}>Logged</Text></View> : null}
      </View>

      <View style={styles.bodyRow}>
        {/* LHS: exercises or warmup notes */}
        <View style={styles.bodyLhs}>
          {presentation.isWarmupOrCooldown ? (
            <View style={styles.notesContainer} testID="segment-notes-content">
              <Text style={styles.notesText}>{presentation.notesText}</Text>
            </View>
          ) : (
            <View style={styles.exerciseList} testID="segment-exercise-list">
              {presentation.showRoundsIndicator ? (
                <View style={styles.roundsIndicator} testID="segment-rounds-indicator">
                  <Ionicons name="sync-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.roundsText}>{presentation.roundsValue} rounds</Text>
                </View>
              ) : null}

              {presentation.segmentHasExercises ? (
                exercises.map((exercise, index) => {
                  const line2 = [
                    exercise.sets != null ? `${exercise.sets} set${exercise.sets !== 1 ? "s" : ""}` : null,
                    exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : null,
                    exercise.intensity ?? null,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <View key={exercise.id ?? `${segment.id}-exercise-${index}`} style={styles.exerciseRow}>
                      <Text
                        style={styles.exerciseName}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {exercise.name}
                      </Text>
                      {line2 ? (
                        <Text style={styles.exerciseMeta} numberOfLines={1} ellipsizeMode="tail">
                          {line2}
                        </Text>
                      ) : null}
                      {exercise.restSeconds != null && exercise.restSeconds > 0 ? (
                        <View style={styles.restRow}>
                          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
                        </View>
                      ) : null}
                      {!isLogged && exercise.guidelineLoad != null && exercise.guidelineLoad.value > 0 ? (
                        <GuidelineLoadHint guidelineLoad={exercise.guidelineLoad} />
                      ) : null}
                      {exercise.adaptationDecision ? (
                        <AdaptationChip
                          decision={exercise.adaptationDecision}
                          onViewHistory={
                            onViewDecisionHistory && exercise.id
                              ? () =>
                                  onViewDecisionHistory(
                                    exercise.exerciseId ?? exercise.id ?? "",
                                    exercise.name,
                                    exercise.id ?? "",
                                  )
                              : undefined
                          }
                        />
                      ) : null}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.exerciseMeta}>No exercises available.</Text>
              )}
            </View>
          )}
        </View>

        {/* RHS: compact ring clock */}
        <View style={styles.bodyRhs}>
          <PremiumTimer
            initialDurationSeconds={initialDurationSeconds}
            suggestedRestSeconds={suggestedRestSeconds}
            segmentId={segment.id}
            compact
          />
        </View>
      </View>

      {(segment.postSegmentRestSec ?? 0) > 0 ? (
        <View style={styles.segmentRestRow}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.segmentRestLabel}>
            Rest {segment.postSegmentRestSec}s before next block
          </Text>
        </View>
      ) : null}

      {presentation.showLogButton ? (
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
  loggedText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bodyLhs: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bodyRhs: {
    flexShrink: 0,
    width: "34%",
    minWidth: 120,
    maxWidth: 160,
    alignItems: "center",
  },
  exerciseList: {
    gap: spacing.sm,
  },
  notesContainer: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  notesText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  roundsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
  roundsText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
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
  segmentRestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  segmentRestLabel: {
    color: colors.textSecondary,
    ...typography.small,
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
