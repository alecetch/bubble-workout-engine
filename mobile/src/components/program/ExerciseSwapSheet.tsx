import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useApplyExerciseSwap,
  useExerciseSwapOptions,
} from "../../api/hooks";
import type { ExerciseSwapOption } from "../../api/programExercise";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ExerciseSwapSheetProps = {
  visible: boolean;
  programExerciseId: string | null;
  currentExerciseName: string | null;
  programDayId: string;
  userId?: string;
  onClose: () => void;
  onSwapApplied?: () => void;
};

export function ExerciseSwapSheet({
  visible,
  programExerciseId,
  currentExerciseName,
  programDayId,
  userId,
  onClose,
  onSwapApplied,
}: ExerciseSwapSheetProps): React.JSX.Element {
  const [selectedOption, setSelectedOption] = useState<ExerciseSwapOption | null>(null);
  const swapOptionsQuery = useExerciseSwapOptions(visible ? programExerciseId : null);
  const applySwapMutation = useApplyExerciseSwap();

  useEffect(() => {
    if (!visible) {
      setSelectedOption(null);
    }
  }, [visible]);

  function handleClose(): void {
    setSelectedOption(null);
    onClose();
  }

  function handleConfirmSwap(): void {
    if (!programExerciseId || !selectedOption || applySwapMutation.isPending) return;

    applySwapMutation.mutate(
      {
        programExerciseId,
        exerciseId: selectedOption.exerciseId,
        reason: null,
        programDayId,
        userId,
      },
      {
        onSuccess: () => {
          setSelectedOption(null);
          if (onSwapApplied) {
            onSwapApplied();
          } else {
            onClose();
          }
        },
      },
    );
  }

  function renderBody(): React.JSX.Element {
    if (!programExerciseId) {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>No exercise selected.</Text>
        </View>
      );
    }

    if (swapOptionsQuery.isLoading) {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading swap options...</Text>
        </View>
      );
    }

    if (swapOptionsQuery.isError) {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>Unable to load swap options</Text>
          <Text style={styles.stateText}>
            {swapOptionsQuery.error?.message ?? "Please try again."}
          </Text>
          <PressableScale style={styles.retryButton} onPress={() => void swapOptionsQuery.refetch()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </PressableScale>
        </View>
      );
    }

    const options = swapOptionsQuery.data?.options ?? [];

    if (selectedOption) {
      return (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>
            Swap {currentExerciseName ?? "exercise"} for {selectedOption.name}?
          </Text>
          <Text style={styles.confirmRationale}>{selectedOption.rationale}</Text>
          {selectedOption.loadGuidance ? (
            <Text style={styles.confirmGuidance}>{selectedOption.loadGuidance}</Text>
          ) : null}
          <Text style={styles.confirmNote}>
            Logged workout history is preserved. Future progression for this slot will recalculate
            from the new exercise.
          </Text>
          {applySwapMutation.isError ? (
            <Text style={styles.errorText}>Unable to swap exercise</Text>
          ) : null}
          <View style={styles.confirmActions}>
            <PressableScale
              style={styles.secondaryButton}
              onPress={() => {
                setSelectedOption(null);
              }}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </PressableScale>
            <PressableScale
              style={[
                styles.primaryButton,
                applySwapMutation.isPending && styles.primaryButtonDisabled,
              ]}
              onPress={handleConfirmSwap}
              disabled={applySwapMutation.isPending}
            >
              <Text style={styles.primaryLabel}>
                {applySwapMutation.isPending ? "Swapping..." : "Confirm swap"}
              </Text>
            </PressableScale>
          </View>
        </View>
      );
    }

    if (options.length === 0) {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>No swap options available</Text>
          <Text style={styles.stateText}>
            No similar swap options are available for your current equipment and profile.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.optionsList}>
        {options.map((option) => (
          <PressableScale
            key={option.exerciseId}
            style={styles.optionCard}
            onPress={() => {
              setSelectedOption(option);
            }}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionName}>{option.name}</Text>
              {option.isLoadable ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Loadable</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.optionRationale}>{option.rationale}</Text>
            {option.loadGuidance ? (
              <Text style={styles.optionGuidance} numberOfLines={3}>
                {option.loadGuidance}
              </Text>
            ) : null}
          </PressableScale>
        ))}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>Swap Exercise</Text>
            <Text style={styles.subtitle}>{currentExerciseName ?? "Selected exercise"}</Text>
            {renderBody()}
            {!selectedOption ? (
              <View style={styles.footer}>
                <PressableScale style={styles.secondaryButton} onPress={handleClose}>
                  <Text style={styles.secondaryLabel}>Cancel</Text>
                </PressableScale>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  stateBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  stateTitle: {
    color: colors.textPrimary,
    textAlign: "center",
    ...typography.h3,
  },
  stateText: {
    color: colors.textSecondary,
    textAlign: "center",
    ...typography.body,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  retryLabel: {
    color: colors.surface,
    ...typography.small,
    fontWeight: "600",
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  optionName: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.h3,
  },
  badge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  optionRationale: {
    color: colors.textSecondary,
    ...typography.body,
  },
  optionGuidance: {
    color: colors.textPrimary,
    ...typography.small,
  },
  confirmCard: {
    gap: spacing.sm,
  },
  confirmTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  confirmRationale: {
    color: colors.textSecondary,
    ...typography.body,
  },
  confirmGuidance: {
    color: colors.textPrimary,
    ...typography.small,
  },
  confirmNote: {
    color: colors.textSecondary,
    ...typography.small,
  },
  confirmActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.xs,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: colors.surface,
    ...typography.small,
    fontWeight: "600",
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
});
