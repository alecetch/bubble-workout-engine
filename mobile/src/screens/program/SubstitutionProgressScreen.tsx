import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { PressableScale } from "../../components/interaction/PressableScale";
import { pollSubstitutionJob, type SubstitutionJobStatus } from "../../api/programDayActions";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "SubstitutionProgress">;

export function SubstitutionProgressScreen({ route, navigation }: Props): React.JSX.Element {
  const { programId, jobId } = route.params;
  const queryClient = useQueryClient();
  const [jobStatus, setJobStatus] = useState<SubstitutionJobStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const poll = async (): Promise<void> => {
      if (Date.now() - startTimeRef.current > 30000) {
        if (pollRef.current) clearInterval(pollRef.current);
        setTimedOut(true);
        return;
      }

      try {
        const status = await pollSubstitutionJob(programId, jobId);
        setJobStatus(status);
        if (status.status === "running") return;

        if (pollRef.current) clearInterval(pollRef.current);
        if (status.status === "failed") return;

        await queryClient.invalidateQueries({ queryKey: ["programOverview"] });

        if (status.status === "partial" && (status.unsubstitutedExerciseIds?.length ?? 0) > 0) {
          Alert.alert(
            "Program updated",
            `${status.swappedCount ?? 0} exercises swapped. ${status.unsubstitutedExerciseIds?.length ?? 0} could not be substituted.`,
          );
        }
        navigation.navigate("ProgramDashboard", { programId });
      } catch {
        // Transient polling failures should not tear down the progress screen.
      }
    };

    void poll();
    pollRef.current = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, navigation, programId, queryClient]);

  if (timedOut || jobStatus?.status === "failed") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{timedOut ? "This is taking too long" : "Update failed"}</Text>
        <Text style={styles.body}>{jobStatus?.error ?? "Please try again."}</Text>
        <PressableScale style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonLabel}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.title}>Updating your program...</Text>
      <Text style={styles.body}>Swapping exercises for the kit you have available.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  button: {
    minHeight: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
