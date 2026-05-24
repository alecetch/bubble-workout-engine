import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { FocusPickerSheet } from "../../components/onboarding/FocusPickerSheet";
import { PressableScale } from "../../components/interaction/PressableScale";
import { patchProgramSplit, useClientProfile, useMe, useSplitRecommendation, useUpdateClientProfile } from "../../api/hooks";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "SplitReview">;

const FOCUS_LABELS: Record<string, string> = {
  full_body: "Full Body",
  upper_body: "Upper",
  lower_body: "Lower",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

function sameSplit(a: string[], b: string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function balanceWarning(focuses: string[]): string | null {
  if (focuses.length < 2) return null;
  const allSame = focuses.every((focus) => focus === focuses[0]);
  if (allSame && (focuses[0] === "upper_body" || focuses[0] === "lower_body")) {
    return "Consider mixing in a full body day to balance your training";
  }
  let streak = 1;
  for (let i = 1; i < focuses.length; i += 1) {
    const upperLower = focuses[i] === "upper_body" || focuses[i] === "lower_body";
    if (upperLower && focuses[i] === focuses[i - 1]) {
      streak += 1;
      if (streak >= 3) return "Back-to-back focus days increase fatigue risk";
    } else {
      streak = 1;
    }
  }
  return null;
}

export function SplitReviewScreen({ navigation, route }: Props): React.JSX.Element {
  const splitQuery = useSplitRecommendation({
    daysPerWeek: route.params?.daysPerWeek,
    programType: route.params?.programType,
  });
  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const profileQuery = useClientProfile(profileId);
  const updateProfile = useUpdateClientProfile(profileId);
  const [currentFocuses, setCurrentFocuses] = useState<string[]>([]);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const recommendation = splitQuery.data?.recommendation ?? [];
  const daysPerWeek = splitQuery.data?.daysPerWeek ?? recommendation.length;
  const programType = splitQuery.data?.programType ?? "hypertrophy";

  useEffect(() => {
    if (splitQuery.data) {
      setCurrentFocuses(splitQuery.data.existingPreference ?? splitQuery.data.recommendation);
    } else if (splitQuery.isError) {
      const fallback = Array(route.params?.daysPerWeek || 3).fill("full_body");
      setCurrentFocuses((prev) => (prev.length ? prev : fallback));
    }
  }, [splitQuery.data, splitQuery.isError, route.params?.daysPerWeek]);

  const dayLabels = useMemo(() => {
    const preferredDays = Array.isArray(profileQuery.data?.preferredDays) ? profileQuery.data.preferredDays : [];
    return currentFocuses.map((_, index) => {
      const day = preferredDays[index];
      return day ? String(day).slice(0, 3).toUpperCase() : `Day ${index + 1}`;
    });
  }, [currentFocuses, profileQuery.data?.preferredDays]);

  const modified = !sameSplit(currentFocuses, recommendation);
  const warning = balanceWarning(currentFocuses);

  async function handleContinue(): Promise<void> {
    if (!currentFocuses.length || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    const preferredSplitJson = {
      day_focuses: currentFocuses,
      modified_by_user: modified,
    };
    try {
      if (profileId) {
        await updateProfile.mutateAsync({ preferredSplitJson });
      }
    } catch (err) {
      console.error("[SplitReview] profile patch failed, proceeding", err);
      setSaveError("We could not save this split, but you can continue.");
    }

    if (route.params?.fromRecalibrate) {
      if (!route.params.programId) {
        setSaveError("Your split was saved, but no active program was found to update.");
        setIsSaving(false);
        return;
      }
      try {
        await patchProgramSplit(route.params.programId, currentFocuses);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Please try again.";
        console.error("[SplitReview] split patch failed", err);
        setSaveError(`Your split was saved, but the active program could not be updated. ${message}`);
        setIsSaving(false);
        return;
      }
      navigation.navigate("ProgramDashboard", { programId: route.params.programId });
      return;
    }

    navigation.navigate("ProgramReview");
    setIsSaving(false);
  }

  const loading = (splitQuery.isLoading || meQuery.isLoading) && !splitQuery.isError && !currentFocuses.length;

  return (
    <>
      <OnboardingScaffold
        step={3}
        title="Your training split"
        subtitle={`We've recommended a split for your ${daysPerWeek || ""}-day ${programType} program. Tap any day to adjust.`}
        errorBannerVisible={Boolean(saveError || splitQuery.isError)}
        onBack={() => navigation.goBack()}
        onNext={() => void handleContinue()}
        nextLabel="Continue"
        nextDisabled={loading || isSaving}
        isSaving={isSaving}
        scrollViewTestID="split-review-screen"
        nextTestID="split-continue-button"
      >
        <SectionCard title="Weekly focus" subtitle="Accept the recommendation or tune any training day.">
          {loading ? (
            <Text style={styles.muted}>Loading your recommended split...</Text>
          ) : (
            <View style={styles.chipRow}>
              {currentFocuses.map((focus, index) => (
                <PressableScale
                  key={`${index}-${focus}`}
                  testID={`split-day-chip-${index}`}
                  style={styles.dayChip}
                  onPress={() => setPickerOpenIndex(index)}
                >
                  <Text style={styles.dayLabel}>{dayLabels[index]}</Text>
                  <Text style={styles.focusLabel}>{FOCUS_LABELS[focus] ?? focus}</Text>
                </PressableScale>
              ))}
            </View>
          )}
          {modified ? (
            <PressableScale
              testID="split-reset-button"
              style={styles.resetButton}
              onPress={() => setCurrentFocuses(recommendation)}
            >
              <Text style={styles.resetLabel}>Reset to recommended</Text>
            </PressableScale>
          ) : null}
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
          {saveError ? <Text style={styles.warning}>{saveError}</Text> : null}
        </SectionCard>
      </OnboardingScaffold>

      <FocusPickerSheet
        visible={pickerOpenIndex !== null}
        currentFocus={pickerOpenIndex == null ? "" : currentFocuses[pickerOpenIndex] ?? ""}
        programType={programType}
        daysPerWeek={daysPerWeek}
        onSelect={(focus) => {
          if (pickerOpenIndex == null) return;
          setCurrentFocuses((current) => current.map((item, index) => (index === pickerOpenIndex ? focus : item)));
        }}
        onClose={() => setPickerOpenIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.textSecondary,
    ...typography.body,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayChip: {
    flex: 1,
    minWidth: 72,
    minHeight: 88,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    gap: spacing.xs,
  },
  dayLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "700",
  },
  focusLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
    textAlign: "center",
  },
  resetButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  resetLabel: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "700",
  },
  warning: {
    color: colors.warning,
    ...typography.small,
  },
});
