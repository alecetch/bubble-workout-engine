import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMe, useSplitRecommendation, useUpdateClientProfile } from "../../api/hooks";
import { authenticatedFetch } from "../../api/client";
import { FocusPickerSheet, FOCUS_LABELS } from "../../components/onboarding/FocusPickerSheet";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { PressableScale } from "../../components/interaction/PressableScale";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "SplitReview">;

function getBalanceWarning(focuses: string[]): string | null {
  if (focuses.length === 0) return null;

  // All same focus and it's upper or lower
  const allSame = focuses.every((f) => f === focuses[0]);
  if (allSame && (focuses[0] === "upper_body" || focuses[0] === "lower_body" || focuses[0] === "push" || focuses[0] === "pull" || focuses[0] === "legs")) {
    return "Consider mixing in a full body day to balance your training";
  }

  // 3+ consecutive upper-only or lower-only days
  const upperFocuses = new Set(["upper_body", "push", "pull"]);
  const lowerFocuses = new Set(["lower_body", "legs"]);

  let consecutiveUpper = 0;
  let consecutiveLower = 0;
  for (const f of focuses) {
    if (upperFocuses.has(f)) {
      consecutiveUpper++;
      consecutiveLower = 0;
    } else if (lowerFocuses.has(f)) {
      consecutiveLower++;
      consecutiveUpper = 0;
    } else {
      consecutiveUpper = 0;
      consecutiveLower = 0;
    }
    if (consecutiveUpper >= 3 || consecutiveLower >= 3) {
      return "Back-to-back focus days increase fatigue risk";
    }
  }

  return null;
}

export function SplitReviewScreen({ route, navigation }: Props): React.JSX.Element {
  const params = route.params ?? {};
  const fromRecalibrate = params.fromRecalibrate === true;
  const programId = params.programId ?? null;

  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const splitQuery = useSplitRecommendation();
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const [currentFocuses, setCurrentFocuses] = useState<string[]>([]);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const initialized = useRef(false);

  // Initialize currentFocuses from API response.
  useEffect(() => {
    if (splitQuery.data && !initialized.current) {
      initialized.current = true;
      setCurrentFocuses(splitQuery.data.existingPreference ?? splitQuery.data.recommendation);
    }
  }, [splitQuery.data]);

  const recommendation = splitQuery.data?.recommendation ?? [];
  const programType = splitQuery.data?.programType ?? "hypertrophy";
  const daysPerWeek = splitQuery.data?.daysPerWeek ?? 3;

  const isModified =
    currentFocuses.length > 0 &&
    JSON.stringify(currentFocuses) !== JSON.stringify(recommendation);

  const balanceWarning = getBalanceWarning(currentFocuses);

  async function handleContinue(): Promise<void> {
    if (isSaving) return;
    setIsSaving(true);

    const modifiedByUser =
      JSON.stringify(currentFocuses) !== JSON.stringify(recommendation);

    const preferredSplitJson = {
      day_focuses: currentFocuses,
      modified_by_user: modifiedByUser,
    };

    if (profileId) {
      try {
        await updateClientProfile.mutateAsync({ preferredSplitJson } as Parameters<typeof updateClientProfile.mutateAsync>[0]);
      } catch (err) {
        console.error("[SplitReview] profile patch failed, proceeding", err);
      }
    }

    if (fromRecalibrate && programId) {
      try {
        await authenticatedFetch(`/api/programs/${programId}/split`, {
          method: "PATCH",
          body: { day_focuses: currentFocuses },
        });
      } catch (err) {
        console.error("[SplitReview] split patch failed, proceeding", err);
      }
      setIsSaving(false);
      navigation.popToTop();
    } else {
      setIsSaving(false);
      navigation.navigate("ProgramReview");
    }
  }

  if (splitQuery.isLoading || meQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading your split...</Text>
      </View>
    );
  }

  if (splitQuery.isError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Unable to load split recommendation.</Text>
        <PressableScale style={styles.retryButton} onPress={() => void splitQuery.refetch()}>
          <Text style={styles.retryLabel}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        testID="split-review-screen"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Your training split</Text>
        <Text style={styles.subtitle}>
          {"We've recommended a split for your "}
          <Text style={styles.subtitleBold}>{daysPerWeek}</Text>
          {"-day "}
          <Text style={styles.subtitleBold}>{programType}</Text>
          {" program.\nTap any day to adjust."}
        </Text>

        <SectionCard title="Training days">
          <View style={styles.chipRow}>
            {currentFocuses.map((focus, i) => (
              <TouchableOpacity
                key={i}
                testID={`split-day-chip-${i}`}
                style={styles.chip}
                onPress={() => setPickerOpenIndex(i)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipDayLabel}>Day {i + 1}</Text>
                <Text style={styles.chipFocusLabel}>{FOCUS_LABELS[focus] ?? focus}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        {isModified ? (
          <TouchableOpacity
            testID="split-reset-button"
            style={styles.resetLink}
            onPress={() => {
              setCurrentFocuses(recommendation);
              initialized.current = true;
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.resetLinkText}>Reset to recommended</Text>
          </TouchableOpacity>
        ) : null}

        {balanceWarning ? (
          <View style={styles.warningRow}>
            <Text style={styles.warningText}>{"⚠ " + balanceWarning}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PressableScale
          testID="split-continue-button"
          style={[styles.continueButton, isSaving && styles.continueButtonDisabled]}
          onPress={() => void handleContinue()}
          disabled={isSaving}
        >
          <Text style={styles.continueLabel}>
            {isSaving ? "Saving..." : "Continue"}
          </Text>
        </PressableScale>
      </View>

      {pickerOpenIndex !== null ? (
        <FocusPickerSheet
          visible={pickerOpenIndex !== null}
          currentFocus={currentFocuses[pickerOpenIndex] ?? "full_body"}
          programType={programType}
          daysPerWeek={daysPerWeek}
          onSelect={(focus) => {
            if (pickerOpenIndex !== null) {
              const next = [...currentFocuses];
              next[pickerOpenIndex] = focus;
              setCurrentFocuses(next);
            }
          }}
          onClose={() => setPickerOpenIndex(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 80,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    marginBottom: spacing.md,
  },
  subtitleBold: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    minWidth: 70,
  },
  chipDayLabel: {
    color: colors.textSecondary,
    ...typography.small,
    marginBottom: 2,
  },
  chipFocusLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
  },
  resetLink: {
    alignSelf: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  resetLinkText: {
    color: colors.accent,
    ...typography.small,
    textDecorationLine: "underline",
  },
  warningRow: {
    backgroundColor: "rgba(250,204,21,0.08)",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.2)",
    padding: spacing.md,
  },
  warningText: {
    color: colors.warning,
    ...typography.small,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  continueButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueLabel: {
    color: colors.surface,
    ...typography.body,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  errorText: {
    color: colors.error,
    ...typography.body,
    textAlign: "center",
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
});
