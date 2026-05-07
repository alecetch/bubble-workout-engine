import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useCompleteProgram, useProgramEndCheck } from "../../api/hooks";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type EndCheckParamList = OnboardingStackParamList & ProgramsStackParamList;
type Props = NativeStackScreenProps<EndCheckParamList, "ProgramEndCheck">;

function formatMissed(count: number): string {
  return `${count} missed workout${count === 1 ? "" : "s"}`;
}

function formatSkipped(count: number): string {
  return `${count} session${count === 1 ? "" : "s"} marked as skipped`;
}

export function ProgramEndCheckScreen({ route, navigation }: Props): React.JSX.Element {
  const { programId } = route.params;
  const endCheckQuery = useProgramEndCheck(programId);
  const completeProgram = useCompleteProgram();

  function goToProgramDashboard(): void {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("ProgramsTab", { screen: "ProgramDashboard", params: { programId } });
      return;
    }
    (navigation as any).navigate("ProgramDashboard", { programId });
  }

  function goToProgramComplete(): void {
    (navigation as any).replace("ProgramComplete", { programId });
  }

  async function handleCompleteAnyway(): Promise<void> {
    try {
      await completeProgram.mutateAsync({ programId, mode: "with_skips" });
      goToProgramComplete();
    } catch {
      // mutation error renders in the body below
    }
  }

  if (endCheckQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Checking end-of-block status...</Text>
      </View>
    );
  }

  if (endCheckQuery.isError || !endCheckQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to check program status</Text>
        <Text style={styles.errorText}>{endCheckQuery.error?.message ?? "Please try again."}</Text>
        <PressableScale style={styles.primaryButton} onPress={() => void endCheckQuery.refetch()}>
          <Text style={styles.primaryLabel}>Retry</Text>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={goToProgramDashboard}>
          <Text style={styles.secondaryLabel}>Back to program</Text>
        </PressableScale>
      </View>
    );
  }

  const endCheck = endCheckQuery.data;
  const showCompletionPath = endCheck.canCompleteWithSkips || endCheck.lifecycleStatus === "completed";

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>You reached the end of this block</Text>
        <Text style={styles.body}>
          {showCompletionPath
            ? `You still have ${formatMissed(endCheck.missedWorkoutsCount)} in this program. You can finish them first, or move on to your next block now.`
            : "You still have workouts left in this program before you can end this block."}
        </Text>
        {endCheck.skippedWorkoutsCount > 0 ? (
          <Text style={styles.skippedNote}>{formatSkipped(endCheck.skippedWorkoutsCount)}.</Text>
        ) : null}

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Completed so far</Text>
          <Text style={styles.statValue}>
            {endCheck.completedDays}/{endCheck.totalDays}
          </Text>
        </View>

        {completeProgram.isError ? (
          <Text style={styles.inlineError}>{completeProgram.error?.message ?? "Unable to complete program."}</Text>
        ) : null}

        <PressableScale style={styles.primaryButton} onPress={goToProgramDashboard}>
          <Text style={styles.primaryLabel}>Finish missed workouts</Text>
        </PressableScale>

        <PressableScale
          style={[styles.secondaryButton, !showCompletionPath && styles.buttonDisabled]}
          onPress={() => {
            void handleCompleteAnyway();
          }}
          disabled={!showCompletionPath || completeProgram.isPending}
        >
          <Text style={styles.secondaryLabel}>
            {completeProgram.isPending ? "Completing..." : "Complete program anyway"}
          </Text>
        </PressableScale>

        <Text style={styles.footnote}>Skipped workouts will remain incomplete.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  skippedNote: {
    color: colors.textSecondary,
    ...typography.body,
  },
  statBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.card,
  },
  statLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  statValue: {
    color: colors.textPrimary,
    ...typography.h3,
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
  primaryButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  inlineError: {
    color: colors.warning,
    ...typography.small,
  },
  footnote: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
});
