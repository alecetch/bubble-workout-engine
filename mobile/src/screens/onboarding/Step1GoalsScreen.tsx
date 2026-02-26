import React, { useMemo, useRef } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { useErrorPulse } from "../../components/onboarding/useErrorPulse";
import { PillGrid } from "../../components/onboarding/PillGrid";
import { MultilineField } from "../../components/onboarding/MultilineField";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import {
  FITNESS_LEVELS,
  GOAL_TYPES,
  INJURY_FLAGS,
  type FitnessLevel,
  type GoalType,
  type InjuryFlag,
} from "../../state/onboarding/types";
import { validateStep } from "../../state/onboarding/validators";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step1Goals">;

type SectionKey = "goals" | "fitnessLevel" | "injuryFlags" | "goalNotes";

const SECTION_ORDER: SectionKey[] = ["goals", "fitnessLevel", "injuryFlags", "goalNotes"];

export function Step1GoalsScreen({ navigation }: Props): React.JSX.Element {
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<Record<SectionKey, number>>({
    goals: 0,
    fitnessLevel: 0,
    injuryFlags: 0,
    goalNotes: 0,
  });

  const goalsPulse = useErrorPulse();
  const fitnessPulse = useErrorPulse();
  const injuryPulse = useErrorPulse();
  const notesPulse = useErrorPulse();

  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const draft = useOnboardingStore((state) => state.draft);
  const attemptedStep1 = useOnboardingStore((state) => state.attempted.step1);
  const fieldErrors = useOnboardingStore((state) => state.fieldErrors);
  const isSaving = useOnboardingStore((state) => state.isSaving);

  const setDraft = useOnboardingStore((state) => state.setDraft);
  const setFieldErrors = useOnboardingStore((state) => state.setFieldErrors);
  const setAttempted = useOnboardingStore((state) => state.setAttempted);
  const setIsSaving = useOnboardingStore((state) => state.setIsSaving);
  const applyInjuryExclusivity = useOnboardingStore((state) => state.applyInjuryExclusivity);

  const goalOptions = useMemo(() => GOAL_TYPES.map((goal) => ({ label: goal, value: goal })), []);
  const fitnessOptions = useMemo(
    () => FITNESS_LEVELS.map((level) => ({ label: level, value: level })),
    [],
  );
  const injuryOptions = useMemo(
    () => INJURY_FLAGS.map((injury) => ({ label: injury, value: injury })),
    [],
  );

  const updateDraftWithValidation = (partial: Partial<typeof draft>): void => {
    const nextDraft = { ...draft, ...partial };
    setDraft(partial);
    const validation = validateStep(1, nextDraft);
    setFieldErrors(validation.fieldErrors);
  };

  const toggleGoal = (goal: GoalType): void => {
    const nextGoals = draft.goals.includes(goal)
      ? draft.goals.filter((item) => item !== goal)
      : [...draft.goals, goal];
    updateDraftWithValidation({ goals: nextGoals });
  };

  const selectFitnessLevel = (level: FitnessLevel): void => {
    const nextValue = draft.fitnessLevel === level ? null : level;
    updateDraftWithValidation({ fitnessLevel: nextValue });
  };

  const toggleInjury = (injury: InjuryFlag): void => {
    const toggled = draft.injuryFlags.includes(injury)
      ? draft.injuryFlags.filter((item) => item !== injury)
      : [...draft.injuryFlags, injury];

    const normalized = applyInjuryExclusivity(toggled);
    const nextDraft = { ...draft, injuryFlags: normalized };
    const validation = validateStep(1, nextDraft);
    setFieldErrors(validation.fieldErrors);
  };

  const handleNotesChange = (goalNotes: string): void => {
    updateDraftWithValidation({ goalNotes });
  };

  const recordSectionLayout = (section: SectionKey) => (event: LayoutChangeEvent): void => {
    sectionOffsetsRef.current[section] = event.nativeEvent.layout.y;
  };

  const pulseSection = (section: SectionKey): void => {
    if (section === "goals") {
      goalsPulse.pulse();
      return;
    }
    if (section === "fitnessLevel") {
      fitnessPulse.pulse();
      return;
    }
    if (section === "injuryFlags") {
      injuryPulse.pulse();
      return;
    }
    notesPulse.pulse();
  };

  const scrollToSection = (section: SectionKey): void => {
    const offsetY = sectionOffsetsRef.current[section] ?? 0;
    scrollRef.current?.scrollTo({
      y: Math.max(0, offsetY - spacing.md),
      animated: true,
    });
    pulseSection(section);
  };

  const firstInvalidSection = (errors: Record<string, string>): SectionKey | null => {
    for (const section of SECTION_ORDER) {
      if (errors[section]) return section;
    }
    return null;
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleNext = async (): Promise<void> => {
    setAttempted(1);

    const validation = validateStep(1, draft);
    setFieldErrors(validation.fieldErrors);

    if (!validation.isValid) {
      await hapticHeavy();
      const firstInvalid = firstInvalidSection(validation.fieldErrors);
      if (firstInvalid) {
        scrollToSection(firstInvalid);
      }
      return;
    }

    if (!profileId) {
      setFieldErrors({ goals: "Unable to save profile right now. Please retry." });
      await hapticHeavy();
      scrollToSection("goals");
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        goals: draft.goals,
        fitnessLevel: draft.fitnessLevel,
        injuryFlags: draft.injuryFlags,
        goalNotes: draft.goalNotes,
        onboardingStepCompleted: draft.onboardingStepCompleted < 1 ? 1 : draft.onboardingStepCompleted,
      });
      navigation.replace("Step2Equipment");
    } catch {
      setFieldErrors({ goals: "Unable to save your changes. Please try again." });
      await hapticHeavy();
      scrollToSection("goals");
    } finally {
      setIsSaving(false);
    }
  };

  const loadingProfile = meQuery.isLoading;

  return (
    <OnboardingScaffold
      step={1}
      title="Goals and background"
      subtitle="Tell us what you're training for so we can build the right plan."
      errorBannerVisible={attemptedStep1 && Object.keys(fieldErrors).length > 0}
      onBack={handleBack}
      onNext={() => {
        void handleNext();
      }}
      nextLabel="Next"
      nextDisabled={loadingProfile || isSaving}
      isSaving={isSaving}
      scrollViewRef={scrollRef}
    >
      <Animated.View onLayout={recordSectionLayout("goals")} style={goalsPulse.animatedStyle}>
        <SectionCard title="Main goals" subtitle="Select one or more.">
          <PillGrid
            options={goalOptions}
            selectedValues={draft.goals}
            onToggle={(value) => toggleGoal(value as GoalType)}
          />
          {fieldErrors.goals ? <Text style={styles.errorText}>{fieldErrors.goals}</Text> : null}
        </SectionCard>
      </Animated.View>

      <Animated.View onLayout={recordSectionLayout("fitnessLevel")} style={fitnessPulse.animatedStyle}>
        <SectionCard title="Fitness level" subtitle="Pick your current level.">
          <PillGrid
            options={fitnessOptions}
            selectedValues={draft.fitnessLevel ? [draft.fitnessLevel] : []}
            onToggle={(value) => selectFitnessLevel(value as FitnessLevel)}
          />
          {fieldErrors.fitnessLevel ? <Text style={styles.errorText}>{fieldErrors.fitnessLevel}</Text> : null}
        </SectionCard>
      </Animated.View>

      <Animated.View onLayout={recordSectionLayout("injuryFlags")} style={injuryPulse.animatedStyle}>
        <SectionCard title="Injuries and limitations" subtitle="Select all that apply.">
          <PillGrid
            options={injuryOptions}
            selectedValues={draft.injuryFlags}
            onToggle={(value) => toggleInjury(value as InjuryFlag)}
          />
          {fieldErrors.injuryFlags ? <Text style={styles.errorText}>{fieldErrors.injuryFlags}</Text> : null}
        </SectionCard>
      </Animated.View>

      <Animated.View onLayout={recordSectionLayout("goalNotes")} style={notesPulse.animatedStyle}>
        <SectionCard title="Goal notes" subtitle="Optional context for your coach.">
          <MultilineField
            label="Notes"
            value={draft.goalNotes}
            onChangeText={handleNotesChange}
            placeholder="Anything specific we should account for?"
            error={fieldErrors.goalNotes}
          />
        </SectionCard>
      </Animated.View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.warning,
    ...typography.small,
    marginTop: spacing.xs,
  },
});
