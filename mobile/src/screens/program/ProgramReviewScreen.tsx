import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useActivePrograms, useClientProfile, useMe } from "../../api/hooks";
import { extractProgramId, generateProgram } from "../../api/program";
import { getEngineKeyStatus } from "../../api/config";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramReview">;

type EditTarget = "Step1Goals" | "Step2Equipment" | "Step3Schedule";

function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) return "Not set";
  return values.join(", ");
}

function formatValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Not set";
  return String(value);
}

export function ProgramReviewScreen({ navigation, route }: Props): React.JSX.Element {
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);
  const setIdentity = useOnboardingStore((state) => state.setIdentity);
  const setActiveProgramId = useSessionStore((state) => state.setActiveProgramId);

  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? null;
  const profileQuery = useClientProfile(profileId);
  const activeProgramsQuery = useActivePrograms();
  const hasActiveProgram = (activeProgramsQuery.data?.programs?.length ?? 0) > 0;

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!meQuery.data?.id) return;
    setIdentity({
      userId: meQuery.data.id,
      clientProfileId: meQuery.data.clientProfileId ?? null,
    });
  }, [meQuery.data?.clientProfileId, meQuery.data?.id, setIdentity]);

  useEffect(() => {
    if (!profileQuery.data) return;
    if (route.params?.preserveDraft) return;
    resetFromProfile(profileQuery.data);
  }, [profileQuery.data, resetFromProfile, route.params?.preserveDraft]);

  const loadError = useMemo(() => {
    return meQuery.error?.message ?? profileQuery.error?.message ?? null;
  }, [meQuery.error?.message, profileQuery.error?.message]);

  const handleEdit = (target: EditTarget): void => {
    if (profileQuery.data && !route.params?.preserveDraft) {
      resetFromProfile(profileQuery.data);
    }
    navigation.navigate(target);
  };

  const handleGenerate = async (): Promise<void> => {
    if (!meQuery.data?.id || !profileId) {
      setGenerationError("Unable to generate: missing user profile link.");
      return;
    }

    setGenerationError(null);
    setGenerationMessage(null);
    setIsGenerating(true);

    try {
      const response = await generateProgram({
        userId: meQuery.data.id,
        clientProfileId: profileId,
        programType: "default",
        anchor_date_ms: Date.now(),
      });

      const programId = extractProgramId(response);
      if (programId) {
        setActiveProgramId(programId);
        const parent = navigation.getParent();
        if (parent) {
          (parent as any).navigate(
            "ProgramsTab" as never,
            { screen: "ProgramDashboard", params: { programId } } as never,
          );
        } else {
          navigation.navigate("ProgramDashboard", { programId });
        }
        return;
      }

      setGenerationMessage("Generation completed. Open program from dashboard.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENGINE_KEY missing in app runtime")) {
        const keyStatus = getEngineKeyStatus();
        setGenerationError(
          `Generation requires ENGINE_KEY. Set EXPO_PUBLIC_ENGINE_KEY in your Expo env.\nEngine key status: hasKey=${keyStatus.hasKey}, source=${keyStatus.source}`,
        );
      } else {
        setGenerationError(error instanceof Error ? error.message : "Failed to generate program.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (meQuery.isLoading || (profileId && profileQuery.isLoading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading your profile summary...</Text>
      </View>
    );
  }

  if (loadError || !profileId || !profileQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn&apos;t load profile</Text>
        <Text style={styles.errorText}>{loadError ?? "Profile is not linked yet."}</Text>
        <PressableScale style={styles.retryButton} onPress={() => {
          void meQuery.refetch();
          if (profileId) {
            void profileQuery.refetch();
          }
        }}>
          <Text style={styles.retryLabel}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  const profile = profileQuery.data;

  return (
    <View style={styles.root}>
      {hasActiveProgram ? (
        <View style={styles.activeProgramBanner}>
          <Text style={styles.activeProgramBannerText}>
            You already have an active program. Generating a new one will replace it.
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Program Review</Text>
        <Text style={styles.subtitle}>Review your setup before generating a program.</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Goals</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step1Goals")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Goals</Text>
          <Text style={styles.rowValue}>{formatList(profile.goals as string[] | undefined)}</Text>
          <Text style={styles.rowLabel}>Goal notes</Text>
          <Text style={styles.rowValue}>{formatValue(profile.goalNotes as string | undefined)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Fitness & Injury</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step1Goals")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Fitness level</Text>
          <Text style={styles.rowValue}>{formatValue(profile.fitnessLevel as string | undefined)}</Text>
          <Text style={styles.rowLabel}>Injury flags</Text>
          <Text style={styles.rowValue}>{formatList(profile.injuryFlags as string[] | undefined)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Equipment</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step2Equipment")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Preset</Text>
          <Text style={styles.rowValue}>
            {formatValue((profile.equipmentPresetCode ?? profile.equipmentPreset) as string | undefined)}
          </Text>
          <Text style={styles.rowLabel}>Equipment items</Text>
          <Text style={styles.rowValue}>
            {formatList((profile.equipmentItemCodes ?? profile.selectedEquipmentCodes) as string[] | undefined)}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Schedule</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step3Schedule")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Preferred days</Text>
          <Text style={styles.rowValue}>{formatList(profile.preferredDays as string[] | undefined)}</Text>
          <Text style={styles.rowLabel}>Minutes per session</Text>
          <Text style={styles.rowValue}>{formatValue(profile.minutesPerSession as number | undefined)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Body Metrics</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step3Schedule")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Height (cm)</Text>
          <Text style={styles.rowValue}>{formatValue(profile.heightCm as number | undefined)}</Text>
          <Text style={styles.rowLabel}>Weight (kg)</Text>
          <Text style={styles.rowValue}>{formatValue(profile.weightKg as number | undefined)}</Text>
          <Text style={styles.rowLabel}>Sex</Text>
          <Text style={styles.rowValue}>{formatValue(profile.sex as string | undefined)}</Text>
          <Text style={styles.rowLabel}>Age range</Text>
          <Text style={styles.rowValue}>{formatValue(profile.ageRange as string | undefined)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Constraints</Text>
            <PressableScale style={styles.editButton} onPress={() => handleEdit("Step3Schedule")}>
              <Text style={styles.editLabel}>Edit</Text>
            </PressableScale>
          </View>
          <Text style={styles.rowLabel}>Schedule constraints</Text>
          <Text style={styles.rowValue}>{formatValue(profile.scheduleConstraints as string | undefined)}</Text>
        </View>

        {generationError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>Generation failed</Text>
            <Text style={styles.errorBannerText}>{generationError}</Text>
            <PressableScale style={styles.retryInlineButton} onPress={() => void handleGenerate()}>
              <Text style={styles.retryInlineLabel}>Retry</Text>
            </PressableScale>
          </View>
        ) : null}

        {generationMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{generationMessage}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {hasActiveProgram ? (
          <>
            <PressableScale
              style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
              onPress={() => {
                const parent = navigation.getParent();
                if (parent) {
                  (parent as any).navigate("TodayTab" as never);
                }
              }}
              disabled={isGenerating}
            >
              <Text style={styles.generateLabel}>View Today&apos;s Workout</Text>
            </PressableScale>
            <PressableScale
              style={styles.generateSecondary}
              onPress={() => void handleGenerate()}
              disabled={isGenerating}
            >
              <Text style={styles.generateSecondaryLabel}>
                {isGenerating ? "Generating..." : "Generate a new program"}
              </Text>
            </PressableScale>
          </>
        ) : (
          <PressableScale
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={() => void handleGenerate()}
            disabled={isGenerating}
          >
            <Text style={styles.generateLabel}>{isGenerating ? "Generating..." : "Generate Program"}</Text>
          </PressableScale>
        )}
      </View>

      {isGenerating ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingTitle}>Generating your program</Text>
            <Text style={styles.loadingCopy}>We&apos;re importing sessions and preparing the viewer.</Text>
          </View>
        </View>
      ) : null}
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
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  errorTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  errorText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 48,
    minWidth: 120,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  editButton: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  editLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  rowLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
  },
  errorBanner: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorBannerTitle: {
    color: colors.warning,
    ...typography.h3,
  },
  errorBannerText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  retryInlineButton: {
    marginTop: spacing.xs,
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  retryInlineLabel: {
    color: "#1A1A1A",
    ...typography.body,
    fontWeight: "600",
  },
  successBanner: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  successText: {
    color: colors.textPrimary,
    ...typography.body,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  generateSecondary: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  generateSecondaryLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  generateButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  activeProgramBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  activeProgramBannerText: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  loadingTitle: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  loadingCopy: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
});
