import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
  exerciseSetCounts?: Record<string, number>;
  onLogSegment: (segment: Segment) => void;
  onSwapExercise?: (
    programExerciseId: string,
    exerciseName: string,
  ) => void;
  onViewDecisionHistory?: (
    exerciseId: string,
    exerciseName: string,
    programExerciseId: string,
  ) => void;
  onViewTechnique?: (exerciseId: string, exerciseName: string) => void;
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
  exerciseSetCounts,
  onLogSegment,
  onSwapExercise,
  onViewDecisionHistory,
  onViewTechnique,
}: SegmentCardProps): React.JSX.Element {
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
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
  const loggedBadgeScale = useSharedValue(isLogged ? 1 : 0.6);
  const loggedBadgeOpacity = useSharedValue(isLogged ? 1 : 0);

  useEffect(() => {
    if (isLogged) {
      loggedBadgeScale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.4)) });
      loggedBadgeOpacity.value = withTiming(1, { duration: 220 });
    } else {
      loggedBadgeScale.value = 0.6;
      loggedBadgeOpacity.value = 0;
    }
  }, [isLogged, loggedBadgeOpacity, loggedBadgeScale]);

  const animatedLoggedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loggedBadgeScale.value }],
    opacity: loggedBadgeOpacity.value,
  }));

  function recommendedLoadHintForExercise(
    exercise: Segment["exercises"][number],
  ): Segment["exercises"][number]["guidelineLoad"] | null {
    const recommendedLoadKg = exercise.progressionRecommendation?.recommendedLoadKg;
    if (recommendedLoadKg != null && recommendedLoadKg > 0) {
      const rawConfidence = String(exercise.progressionRecommendation?.confidence ?? "").toLowerCase();
      const confidence =
        rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
          ? rawConfidence
          : "medium";
      return {
        value: recommendedLoadKg,
        unit: "kg",
        confidence,
        source: exercise.progressionRecommendation?.source ?? "progression_recommendation",
        reasoning: exercise.progressionRecommendation?.reasoning ?? [],
        set1Rule: "Based on your last performance, this is the proposed load for this session.",
      };
    }
    if (exercise.guidelineLoad != null && exercise.guidelineLoad.value > 0) {
      return exercise.guidelineLoad;
    }
    return null;
  }

  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpandedExerciseId(null)}
    >
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
        <Animated.View style={[styles.loggedBadge, animatedLoggedBadgeStyle]}>
          <Text style={styles.loggedText}>Logged</Text>
        </Animated.View>
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
                  const loggedSetCount = exercise.id ? Number(exerciseSetCounts?.[exercise.id] ?? 0) : 0;
                  const hasLoggedSets = loggedSetCount > 0;

                  return (
                    <View key={exercise.id ?? `${segment.id}-exercise-${index}`} style={styles.exerciseRow}>
                      <View style={styles.exerciseHeaderRow}>
                        <Text
                          style={styles.exerciseName}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {exercise.name}
                        </Text>
                        {hasLoggedSets ? (
                          <View style={styles.exerciseLoggedBadge}>
                            <Text style={styles.exerciseLoggedBadgeText}>
                              Logged {loggedSetCount} set{loggedSetCount === 1 ? "" : "s"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {exercise.adaptationDecision ? (
                        <AdaptationChip
                          decision={exercise.adaptationDecision}
                          expanded={expandedExerciseId === exercise.id}
                          onToggle={() =>
                            setExpandedExerciseId((prev) => (prev === exercise.id ? null : exercise.id ?? null))
                          }
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
                      {line2 ? (
                        <Text style={styles.exerciseMeta} numberOfLines={1} ellipsizeMode="tail">
                          {line2}
                        </Text>
                      ) : null}
                      {!isLogged &&
                      onViewTechnique &&
                      exercise.exerciseId &&
                      (exercise.coachingCuesJson?.length ?? 0) > 0 ? (
                        <PressableScale
                          style={styles.formTipChip}
                          onPress={() => onViewTechnique(exercise.exerciseId ?? "", exercise.name)}
                        >
                          <Text style={styles.formTipLabel}>Form tip</Text>
                        </PressableScale>
                      ) : null}
                      {exercise.restSeconds != null && exercise.restSeconds > 0 ? (
                        <View style={styles.restRow}>
                          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
                        </View>
                      ) : null}
                      {!isLogged && onSwapExercise && exercise.id ? (
                        <PressableScale
                          style={styles.swapLink}
                          onPress={() => onSwapExercise(exercise.id ?? "", exercise.name)}
                        >
                          <Text style={styles.swapLinkLabel}>Swap exercise</Text>
                        </PressableScale>
                      ) : null}
                      {!isLogged ? (() => {
                        const loadHint = recommendedLoadHintForExercise(exercise);
                        return loadHint ? <GuidelineLoadHint guidelineLoad={loadHint} /> : null;
                      })() : null}
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
        <PressableScale
          style={[styles.logButton, isLogged ? styles.logButtonLogged : null]}
          onPress={() => onLogSegment(segment)}
        >
          <Text style={[styles.logButtonLabel, isLogged ? styles.logButtonLabelLogged : null]}>
            {isLogged ? "Segment Logged" : "Log segment"}
          </Text>
        </PressableScale>
      ) : null}
    </Pressable>
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
  formTipChip: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  formTipLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  exerciseRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: 2,
  },
  exerciseHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  exerciseName: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  exerciseLoggedBadge: {
    borderRadius: radii.pill,
    backgroundColor: "rgba(34,197,94,0.16)",
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  exerciseLoggedBadgeText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
  },
  exerciseMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  swapLink: {
    alignSelf: "flex-start",
  },
  swapLinkLabel: {
    color: colors.accent,
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
  logButtonLogged: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  logButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  logButtonLabelLogged: {
    color: colors.textPrimary,
  },
});
