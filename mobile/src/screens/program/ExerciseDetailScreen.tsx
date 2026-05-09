import React, { useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useExerciseGuidance } from "../../api/hooks";
import type { AdaptationDecision, ProgramDayFullResponse } from "../../api/programViewer";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { PressableScale } from "../../components/interaction/PressableScale";
import { AdaptationChip } from "../../components/program/AdaptationChip";
import { GuidelineLoadHint } from "../../components/program/GuidelineLoadHint";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type GuidelineLoad = NonNullable<
  ProgramDayFullResponse["segments"][number]["exercises"][number]["guidelineLoad"]
>;

export type ExerciseDetailParams = {
  exerciseId: string;
  programExerciseId: string;
  exerciseName: string;
  sets?: number | null;
  reps?: string | null;
  repsUnit?: string | null;
  intensity?: string | null;
  restSeconds?: number | null;
  guidelineLoadJson?: string | null;
  adaptationDecisionJson?: string | null;
  canSwap?: boolean;
};

type ExerciseDetailRouteParamList = {
  ExerciseDetail: ExerciseDetailParams;
};

type Props = NativeStackScreenProps<ExerciseDetailRouteParamList, "ExerciseDetail">;

function parseJsonOrNull<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function hasAnyGuidanceContent(guidance: ReturnType<typeof useExerciseGuidance>["data"]): boolean {
  return Boolean(
    guidance &&
      (
        guidance.techniqueCue ||
        guidance.coachingCues.length > 0 ||
        guidance.techniqueSetup ||
        guidance.techniqueExecution.length > 0 ||
        guidance.techniqueMistakes.length > 0 ||
        guidance.loadGuidance ||
        guidance.loggingGuidance ||
        guidance.techniqueVideoUrl
      ),
  );
}

function formatPrescription(
  sets?: number | null,
  reps?: string | null,
  repsUnit?: string | null,
): string | null {
  if (sets == null && !reps) return null;
  const left = sets != null ? `${sets} set${sets === 1 ? "" : "s"}` : null;
  const right = reps ? `${reps} ${repsUnit ?? "reps"}` : null;
  return [left, right].filter(Boolean).join(" x ");
}

export function ExerciseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const {
    exerciseId,
    exerciseName,
    sets,
    reps,
    repsUnit,
    intensity,
    restSeconds,
    guidelineLoadJson,
    adaptationDecisionJson,
  } = route.params;
  const [adaptationExpanded, setAdaptationExpanded] = useState(false);
  const guidanceQuery = useExerciseGuidance(exerciseId);

  const guidelineLoad = useMemo(
    () => parseJsonOrNull<GuidelineLoad>(guidelineLoadJson),
    [guidelineLoadJson],
  );
  const adaptationDecision = useMemo(
    () => parseJsonOrNull<AdaptationDecision>(adaptationDecisionJson),
    [adaptationDecisionJson],
  );
  const prescriptionLine = formatPrescription(sets, reps, repsUnit);
  const hasGuidance = hasAnyGuidanceContent(guidanceQuery.data);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: exerciseName,
    });
  }, [exerciseName, navigation]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Prescription</Text>
        {prescriptionLine ? <Text style={styles.primaryLine}>{prescriptionLine}</Text> : null}
        {intensity?.trim() ? <Text style={styles.secondaryLine}>{`@${intensity.trim()}`}</Text> : null}
        {restSeconds != null ? <Text style={styles.secondaryLine}>{`Rest ${restSeconds} s`}</Text> : null}
        {guidelineLoad ? <GuidelineLoadHint guidelineLoad={guidelineLoad} /> : null}
        {adaptationDecision ? (
          <AdaptationChip
            decision={adaptationDecision}
            expanded={adaptationExpanded}
            onToggle={() => setAdaptationExpanded((current) => !current)}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Technique</Text>
        {guidanceQuery.isLoading ? (
          <SkeletonBlock height={220} />
        ) : guidanceQuery.isError ? (
          <Text style={styles.emptyText}>
            {guidanceQuery.error?.message ?? "Unable to load technique guidance."}
          </Text>
        ) : !hasGuidance ? (
          <Text style={styles.emptyText}>No technique notes for this exercise yet.</Text>
        ) : (
          <View style={styles.guidanceBody}>
            {guidanceQuery.data?.techniqueCue ? (
              <Text style={styles.headlineCue}>{guidanceQuery.data.techniqueCue}</Text>
            ) : null}

            {(guidanceQuery.data?.coachingCues.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cues</Text>
                {guidanceQuery.data?.coachingCues.map((cue, index) => (
                  <View key={`${cue}-${index}`} style={styles.row}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bodyText}>{cue}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {guidanceQuery.data?.techniqueSetup ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Setup</Text>
                <Text style={styles.bodyText}>{guidanceQuery.data.techniqueSetup}</Text>
              </View>
            ) : null}

            {(guidanceQuery.data?.techniqueExecution.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Execution</Text>
                {guidanceQuery.data?.techniqueExecution.map((step, index) => (
                  <View key={`${step}-${index}`} style={styles.row}>
                    <Text style={styles.number}>{`${index + 1}.`}</Text>
                    <Text style={styles.bodyText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {(guidanceQuery.data?.techniqueMistakes.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Common mistakes</Text>
                {guidanceQuery.data?.techniqueMistakes.map((mistake, index) => (
                  <View key={`${mistake}-${index}`} style={styles.row}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bodyText}>{mistake}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {guidanceQuery.data?.loadGuidance ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Loading</Text>
                <Text style={styles.bodyText}>{guidanceQuery.data.loadGuidance}</Text>
              </View>
            ) : null}

            {guidanceQuery.data?.loggingGuidance ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>What to log</Text>
                <Text style={styles.bodyText}>{guidanceQuery.data.loggingGuidance}</Text>
              </View>
            ) : null}

            {guidanceQuery.data?.techniqueVideoUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Video</Text>
                <PressableScale
                  style={styles.videoLinkButton}
                  onPress={() => {
                    void Linking.openURL(guidanceQuery.data?.techniqueVideoUrl ?? "");
                  }}
                >
                  <Text style={styles.videoLinkLabel}>Open video</Text>
                </PressableScale>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  primaryLine: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  secondaryLine: {
    color: colors.textSecondary,
    ...typography.body,
  },
  guidanceBody: {
    gap: spacing.md,
  },
  headlineCue: {
    color: colors.accent,
    ...typography.h2,
    fontWeight: "700",
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  bullet: {
    width: 14,
    color: colors.textSecondary,
    ...typography.body,
  },
  number: {
    width: 20,
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "600",
  },
  bodyText: {
    flex: 1,
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  videoLinkButton: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  videoLinkLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
});
