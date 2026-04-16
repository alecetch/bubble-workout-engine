import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useProgramCompletionSummary } from "../../api/hooks";
import type { ProgramCompletionSummary } from "../../api/programCompletion";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import {
  GOAL_TYPES,
  type FitnessLevel,
  type GoalType,
  type ProfileLike,
} from "../../state/onboarding/types";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type CompletionStackParamList = OnboardingStackParamList & ProgramsStackParamList;
type Props = NativeStackScreenProps<CompletionStackParamList, "ProgramComplete">;

function toFitnessLevelFromSlug(slug: string | null): FitnessLevel | null {
  const normalized = slug?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized === "beginner") return "Beginner";
  if (normalized === "intermediate") return "Intermediate";
  if (normalized === "advanced") return "Advanced";
  if (normalized === "elite") return "Elite";
  return null;
}

function toFitnessLevelFromRank(rank: number): FitnessLevel {
  if (rank <= 0) return "Beginner";
  if (rank === 1) return "Intermediate";
  if (rank === 2) return "Advanced";
  return "Elite";
}

function helperTextForOption(option: "same_settings" | "progress_level" | "change_goals"): string {
  if (option === "same_settings") return "Use your current setup unchanged and generate the next block.";
  if (option === "progress_level") return "Keep your setup, but move up to the next fitness level.";
  return "Start from your current profile, then tweak goals before generating.";
}

function confidenceLabel(value: "low" | "medium" | "high" | null): string {
  if (value === "low") return "Low";
  if (value === "medium") return "Medium";
  if (value === "high") return "High";
  return "Not set";
}

function toGoalTypes(values: string[]): GoalType[] {
  return values.filter((value): value is GoalType =>
    (GOAL_TYPES as readonly string[]).includes(value),
  );
}

function buildPrefillProfile(
  summary: ProgramCompletionSummary,
  option: "same_settings" | "progress_level" | "change_goals",
): ProfileLike {
  const currentLevel =
    toFitnessLevelFromSlug(summary.currentProfile.fitnessLevelSlug) ??
    toFitnessLevelFromRank(summary.currentProfile.fitnessRank);
  const nextLevel =
    option === "progress_level" ? toFitnessLevelFromRank(summary.suggestedNextRank) : currentLevel;

  return {
    fitnessLevel: nextLevel,
    goals: toGoalTypes(summary.currentProfile.goals),
    minutes_per_session: summary.currentProfile.minutesPerSession,
    preferred_days: summary.currentProfile.preferredDays,
    equipment_items_slugs: summary.currentProfile.equipmentItemsSlugs,
    equipment_preset_slug: summary.currentProfile.equipmentPresetSlug,
  };
}

export function ProgramCompleteScreen({ route, navigation }: Props): React.JSX.Element {
  const { programId } = route.params;
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const summaryQuery = useProgramCompletionSummary(programId);
  const [selectedOption, setSelectedOption] = useState<
    "same_settings" | "progress_level" | "change_goals" | null
  >(null);

  useEffect(() => {
    const next = summaryQuery.data?.reEnrollmentOptions[0]?.option ?? null;
    setSelectedOption((current) => current ?? next);
  }, [summaryQuery.data?.reEnrollmentOptions]);

  const personalRecords = useMemo(
    () => summaryQuery.data?.personalRecords.slice(0, 3) ?? [],
    [summaryQuery.data?.personalRecords],
  );

  function navigateIntoHome(
    screen: "ProgramReview" | "Step1Goals",
    params?: OnboardingStackParamList["ProgramReview"],
  ): void {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("HomeTab", { screen, params });
      return;
    }

    if (screen === "Step1Goals") {
      (navigation as any).navigate("Step1Goals");
    } else {
      (navigation as any).navigate("ProgramReview", params);
    }
  }

  function handleBackToProgram(): void {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("ProgramsTab", { screen: "ProgramDashboard", params: { programId } });
      return;
    }
    navigation.goBack();
  }

  function handleContinue(): void {
    if (!summaryQuery.data || !selectedOption) return;
    resetFromProfile(buildPrefillProfile(summaryQuery.data, selectedOption));

    if (selectedOption === "change_goals") {
      navigateIntoHome("Step1Goals");
      return;
    }

    navigateIntoHome("ProgramReview", { preserveDraft: true });
  }

  if (summaryQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading completion summary...</Text>
      </View>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to load program summary</Text>
        <Text style={styles.errorText}>{summaryQuery.error?.message ?? "Please try again."}</Text>
        <PressableScale style={styles.primaryButton} onPress={() => void summaryQuery.refetch()}>
          <Text style={styles.primaryButtonLabel}>Retry</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={handleBackToProgram}>
          <Text style={styles.secondaryButtonLabel}>Back</Text>
        </PressableScale>
      </View>
    );
  }

  const summary = summaryQuery.data;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.title}>Program complete!</Text>
          <Text style={styles.subtitle}>
            You finished all scheduled sessions. Ready for the next block?
          </Text>
          <Text style={styles.programTitle}>{summary.programTitle}</Text>
          {summary.programType ? <Text style={styles.programType}>{summary.programType}</Text> : null}
          {summary.completedMode === "with_skips" ? (
            <Text style={styles.skippedCopy}>
              Completed with {summary.missedWorkoutsCount} skipped workout{summary.missedWorkoutsCount === 1 ? "" : "s"}.
            </Text>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Days complete</Text>
            <Text style={styles.statValue}>
              {summary.daysCompleted}/{summary.daysTotal}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Exercises progressed</Text>
            <Text style={styles.statValue}>{summary.exercisesProgressed}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Confidence</Text>
            <Text style={styles.statValue}>{confidenceLabel(summary.avgConfidence)}</Text>
          </View>
        </View>

        {personalRecords.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Highlights</Text>
            {personalRecords.map((record) => (
              <View key={`${record.exerciseId}-${record.exerciseName}`} style={styles.prCard}>
                <Text style={styles.prExercise}>{record.exerciseName}</Text>
                <Text style={styles.prValue}>{record.bestWeightKg} kg</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose your next block</Text>
          {summary.reEnrollmentOptions.map((option) => {
            const isActive = selectedOption === option.option;
            return (
              <PressableScale
                key={option.option}
                style={[styles.optionCard, isActive && styles.optionCardActive]}
                onPress={() => setSelectedOption(option.option)}
              >
                <Text style={styles.optionTitle}>{option.label}</Text>
                <Text style={styles.optionHelper}>{helperTextForOption(option.option)}</Text>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PressableScale
          style={[styles.primaryButton, !selectedOption && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedOption}
        >
          <Text style={styles.primaryButtonLabel}>Continue</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={handleBackToProgram}>
          <Text style={styles.secondaryButtonLabel}>Back to program</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  errorTitle: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  errorText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 144,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  programTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  programType: {
    color: colors.textSecondary,
    ...typography.small,
    textTransform: "capitalize",
  },
  skippedCopy: {
    color: colors.warning,
    ...typography.small,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  statValue: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  prCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  prExercise: {
    color: colors.textPrimary,
    ...typography.body,
    flex: 1,
  },
  prValue: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "700",
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  optionTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  optionHelper: {
    color: colors.textSecondary,
    ...typography.small,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
