import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";
import type { SetInputState } from "../sessionUxLogic";
import { InlineRestStrip } from "./InlineRestStrip";
import { RirRoundPicker } from "./RirRoundPicker";
import { RoundSummaryRow } from "./RoundSummaryRow";
import { SegmentEffortPicker } from "./SegmentEffortPicker";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type RestStripRenderProps = {
  restDisplaySeconds: number;
  restProgress: number;
  showAdjustControls: boolean;
  onToggleAdjust: () => void;
  onReset: () => void;
  onAdjust: (delta: number) => void;
  onAdjustLongPress: (delta: number) => void;
};

type RoundBasedLoggingPanelProps = {
  totalRounds: number;
  completedRoundIndices: Set<number>;
  activeRoundIndex: number;
  showPostStopRir: boolean;
  expandedRoundIndices: Set<number>;
  onToggleExpandedRound: (roundIndex: number) => void;
  loggableExercises: Exercise[];
  inputMap: Record<string, SetInputState[]>;
  onUpdateSetInput: (
    exerciseKey: string,
    setIndex: number,
    updater: (prev: SetInputState) => SetInputState,
  ) => void;
  exerciseRirMap: Record<string, number | null>;
  onSelectRir: (exercise: Exercise, optionValue: number) => void;
  useCombinedEffort?: boolean;
  onSelectCombinedRir?: (optionValue: number) => void;
  roundSaveError: string | null;
  onRoundComplete: (roundIndex: number) => void | Promise<void>;
  onPostStopRirDone: () => void | Promise<void>;
  getExerciseValue: (exercise: Exercise, roundIndex: number) => string | null;
  showRestStrip?: boolean;
  restStripProps?: RestStripRenderProps;
};

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

export function RoundBasedLoggingPanel({
  totalRounds,
  completedRoundIndices,
  activeRoundIndex,
  showPostStopRir,
  expandedRoundIndices,
  onToggleExpandedRound,
  loggableExercises,
  inputMap,
  onUpdateSetInput,
  exerciseRirMap,
  onSelectRir,
  useCombinedEffort = false,
  onSelectCombinedRir,
  roundSaveError,
  onRoundComplete,
  onPostStopRirDone,
  getExerciseValue,
  showRestStrip = false,
  restStripProps,
}: RoundBasedLoggingPanelProps): React.JSX.Element {
  const combinedRirValue = exerciseRirMap[loggableExercises[0]?.id ?? ""] ?? null;
  const handleCombinedRirSelect = onSelectCombinedRir ?? (() => undefined);

  return (
    <>
      {Array.from({ length: totalRounds }, (_value, roundIndex) => {
        const isCompleted = completedRoundIndices.has(roundIndex);
        const isActive = roundIndex === activeRoundIndex && !isCompleted && !showPostStopRir;
        const isLocked = !isCompleted && !isActive;
        const isLastRound = roundIndex === totalRounds - 1;

        if (isCompleted) {
          return (
            <RoundSummaryRow
              key={roundIndex}
              roundIndex={roundIndex}
              expanded={expandedRoundIndices.has(roundIndex)}
              onToggle={onToggleExpandedRound}
              loggableExercises={loggableExercises}
              getExerciseValue={getExerciseValue}
            />
          );
        }

        if (isLocked) {
          return (
            <View key={roundIndex} style={styles.roundLockedRow}>
              <Text style={styles.roundLockedLabel}>
                {`Round ${roundIndex + 1} · complete round ${roundIndex} to unlock`}
              </Text>
            </View>
          );
        }

        return (
          <React.Fragment key={roundIndex}>
            {showRestStrip && restStripProps ? <InlineRestStrip {...restStripProps} /> : null}
            <View style={styles.roundActiveBlock}>
            <Text style={styles.roundActiveLabel}>{`Round ${roundIndex + 1}`}</Text>
            {loggableExercises.map((exercise) => {
              const exerciseKey = exercise.id ?? "";
              const row = inputMap[exerciseKey]?.[roundIndex] ?? { weight: "", reps: "", rirActual: null };
              return (
                <View key={exerciseKey} style={styles.roundExerciseRow}>
                  <Text style={styles.roundExerciseName} numberOfLines={1}>{exercise.name}</Text>
                  {isUnloadedExercise(exercise) ? (
                    <View style={styles.weightInputGroup}>
                      <Text style={styles.bodyweightDash}>—</Text>
                    </View>
                  ) : (
                    <View style={styles.weightInputGroup}>
                      <TextInput
                        value={row.weight}
                        onChangeText={(value) => {
                          const sanitized = value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                          onUpdateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, weight: sanitized }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textSecondary}
                        style={styles.inputField}
                      />
                      <View style={styles.inputSuffixWrap}>
                        <Text style={styles.inputSuffix}>kg</Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.repsInputGroup}>
                    <TextInput
                      value={row.reps}
                      onChangeText={(value) => {
                        const sanitized = value.replace(/[^0-9]/g, "");
                        onUpdateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, reps: sanitized }));
                      }}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      style={styles.inputField}
                    />
                  </View>
                </View>
              );
            })}
            {isLastRound ? (
              <View style={styles.exerciseRirBlock}>
                <Text style={styles.exerciseRirQuestion}>
                  {useCombinedEffort ? "How hard was this superset?" : "How many more reps could you complete per set?"}
                </Text>
                {useCombinedEffort ? (
                  <SegmentEffortPicker
                    selectedValue={combinedRirValue}
                    onSelect={handleCombinedRirSelect}
                  />
                ) : (
                  loggableExercises.map((exercise) => (
                    <RirRoundPicker
                      key={exercise.id ?? exercise.name}
                      exercise={exercise}
                      selectedRir={exerciseRirMap[exercise.id ?? ""] ?? null}
                      onSelect={(optionValue) => onSelectRir(exercise, optionValue)}
                    />
                  ))
                )}
                <View style={styles.rirHintRow}>
                  <Text style={styles.rirHintText}>{useCombinedEffort ? "Comfortable" : "Too easy"}</Text>
                  <Text style={styles.rirHintText}>Max effort</Text>
                </View>
              </View>
            ) : null}
            {roundSaveError ? (
              <Text style={styles.roundSaveError}>{roundSaveError}</Text>
            ) : null}
            <PressableScale
              style={styles.markRoundButton}
              onPress={() => { void onRoundComplete(roundIndex); }}
            >
              <Text style={styles.markRoundButtonLabel}>Mark round complete</Text>
            </PressableScale>
            </View>
          </React.Fragment>
        );
      })}
      {showPostStopRir ? (
        <>
          {showRestStrip && restStripProps ? <InlineRestStrip {...restStripProps} /> : null}
          <View style={styles.postStopRirBlock}>
            <Text style={styles.exerciseRirQuestion}>
              {useCombinedEffort ? "How hard was this superset?" : "How many more reps could you complete per set?"}
            </Text>
            {useCombinedEffort ? (
              <SegmentEffortPicker
                selectedValue={combinedRirValue}
                onSelect={handleCombinedRirSelect}
              />
            ) : (
              loggableExercises.map((exercise) => (
                <RirRoundPicker
                  key={exercise.id ?? exercise.name}
                  exercise={exercise}
                  selectedRir={exerciseRirMap[exercise.id ?? ""] ?? null}
                  onSelect={(optionValue) => onSelectRir(exercise, optionValue)}
                />
              ))
            )}
            <View style={styles.rirHintRow}>
              <Text style={styles.rirHintText}>{useCombinedEffort ? "Comfortable" : "Too easy"}</Text>
              <Text style={styles.rirHintText}>Max effort</Text>
            </View>
            <PressableScale
              style={styles.markRoundButton}
              onPress={() => { void onPostStopRirDone(); }}
            >
              <Text style={styles.markRoundButtonLabel}>Done</Text>
            </PressableScale>
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  weightInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1.35,
    height: 36,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  repsInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 0.85,
    height: 36,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  inputField: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    paddingVertical: 0,
    margin: 0,
    includeFontPadding: false,
  },
  inputSuffixWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  inputSuffix: {
    color: colors.textSecondary,
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
  },
  bodyweightDash: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    textAlign: "center",
  },
  roundActiveBlock: {
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  roundActiveLabel: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
  },
  roundExerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  roundExerciseName: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  roundLockedRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  roundLockedLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  markRoundButton: {
    alignSelf: "stretch",
    minHeight: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  markRoundButtonLabel: {
    color: colors.background,
    ...typography.label,
    fontWeight: "700",
  },
  roundSaveError: {
    color: colors.warning,
    ...typography.small,
    fontWeight: "600",
  },
  postStopRirBlock: {
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  exerciseRirBlock: {
    gap: spacing.xs,
  },
  exerciseRirQuestion: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  rirHintRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rirHintText: {
    color: colors.textSecondary,
    ...typography.label,
  },
});
