import React, { useMemo, useRef, useState } from "react";
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
import { DayChipRow } from "../../components/onboarding/DayChipRow";
import { SelectField } from "../../components/onboarding/SelectField";
import { NumericField } from "../../components/onboarding/NumericField";
import { MultilineField } from "../../components/onboarding/MultilineField";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import {
  AGE_RANGES,
  DAYS_OF_WEEK,
  MINUTES_PER_SESSION,
  SEX_OPTIONS,
  type AgeRange,
  type DayOfWeek,
  type MinutesPerSession,
  type Sex,
} from "../../state/onboarding/types";
import { validateStep } from "../../state/onboarding/validators";
import { normalizeText } from "../../utils/normalizeText";
import { parseNumberOrNull } from "../../utils/numbers";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step3Schedule">;

type SectionKey = "preferredDays" | "sessionSettings" | "bodyMetrics" | "scheduleConstraints";

const SECTION_ORDER: SectionKey[] = [
  "preferredDays",
  "sessionSettings",
  "bodyMetrics",
  "scheduleConstraints",
];

const SECTION_ERROR_KEYS: Record<SectionKey, string[]> = {
  preferredDays: ["preferredDays"],
  sessionSettings: ["minutesPerSession", "sex", "ageRange"],
  bodyMetrics: ["heightCm", "weightKg"],
  scheduleConstraints: ["scheduleConstraints"],
};

export function Step3ScheduleMetricsScreen({ navigation }: Props): React.JSX.Element {
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<Record<SectionKey, number>>({
    preferredDays: 0,
    sessionSettings: 0,
    bodyMetrics: 0,
    scheduleConstraints: 0,
  });

  const preferredDaysPulse = useErrorPulse();
  const sessionSettingsPulse = useErrorPulse();
  const bodyMetricsPulse = useErrorPulse();
  const scheduleConstraintsPulse = useErrorPulse();

  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const draft = useOnboardingStore((state) => state.draft);
  const attemptedStep3 = useOnboardingStore((state) => state.attempted.step3);
  const fieldErrors = useOnboardingStore((state) => state.fieldErrors);
  const isSaving = useOnboardingStore((state) => state.isSaving);

  const setDraft = useOnboardingStore((state) => state.setDraft);
  const setFieldErrors = useOnboardingStore((state) => state.setFieldErrors);
  const setAttempted = useOnboardingStore((state) => state.setAttempted);
  const setIsSaving = useOnboardingStore((state) => state.setIsSaving);

  const [heightInput, setHeightInput] = useState(draft.heightCm == null ? "" : String(draft.heightCm));
  const [weightInput, setWeightInput] = useState(draft.weightKg == null ? "" : String(draft.weightKg));

  const dayOptions = useMemo(
    () => DAYS_OF_WEEK.map((day) => ({ label: day, value: day })),
    [],
  );
  const minuteOptions = useMemo(
    () => MINUTES_PER_SESSION.map((value) => ({ label: `${value} min`, value: String(value) })),
    [],
  );
  const sexOptions = useMemo(
    () => SEX_OPTIONS.map((value) => ({ label: value, value })),
    [],
  );
  const ageRangeOptions = useMemo(
    () => AGE_RANGES.map((value) => ({ label: value, value })),
    [],
  );

  const under18Selected = draft.ageRange === "Under 18";

  const updateValidation = (nextDraft: typeof draft): void => {
    const validation = validateStep(3, nextDraft);
    setFieldErrors(validation.fieldErrors);
  };

  const togglePreferredDay = (day: string): void => {
    const normalizedDay = day as DayOfWeek;
    const nextDays = draft.preferredDays.includes(normalizedDay)
      ? draft.preferredDays.filter((item) => item !== normalizedDay)
      : [...draft.preferredDays, normalizedDay];

    const nextDraft = { ...draft, preferredDays: nextDays };
    setDraft({ preferredDays: nextDays });
    updateValidation(nextDraft);
  };

  const handleMinutesSelect = (value: string): void => {
    const parsed = Number(value) as MinutesPerSession;
    const minutesPerSession = Number.isFinite(parsed) ? parsed : null;
    const nextDraft = { ...draft, minutesPerSession };
    setDraft({ minutesPerSession });
    updateValidation(nextDraft);
  };

  const handleSexSelect = (value: string): void => {
    const sex = value as Sex;
    const nextDraft = { ...draft, sex };
    setDraft({ sex });
    updateValidation(nextDraft);
  };

  const handleAgeRangeSelect = (value: string): void => {
    const ageRange = value as AgeRange;
    const nextDraft = { ...draft, ageRange };
    setDraft({ ageRange });
    updateValidation(nextDraft);
  };

  const handleHeightChange = (text: string): void => {
    setHeightInput(text);
    const parsed = parseNumberOrNull(text);
    const heightCm = parsed == null ? null : Math.round(parsed);
    const nextDraft = { ...draft, heightCm };
    setDraft({ heightCm });
    updateValidation(nextDraft);
  };

  const handleWeightChange = (text: string): void => {
    setWeightInput(text);
    const parsed = parseNumberOrNull(text);
    const weightKg = parsed == null ? null : Number(parsed.toFixed(1));
    const nextDraft = { ...draft, weightKg };
    setDraft({ weightKg });
    updateValidation(nextDraft);
  };

  const handleScheduleConstraintsChange = (scheduleConstraints: string): void => {
    const nextDraft = { ...draft, scheduleConstraints };
    setDraft({ scheduleConstraints });
    updateValidation(nextDraft);
  };

  const recordSectionLayout = (section: SectionKey) => (event: LayoutChangeEvent): void => {
    sectionOffsetsRef.current[section] = event.nativeEvent.layout.y;
  };

  const pulseSection = (section: SectionKey): void => {
    if (section === "preferredDays") {
      preferredDaysPulse.pulse();
      return;
    }
    if (section === "sessionSettings") {
      sessionSettingsPulse.pulse();
      return;
    }
    if (section === "bodyMetrics") {
      bodyMetricsPulse.pulse();
      return;
    }
    scheduleConstraintsPulse.pulse();
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
      const keys = SECTION_ERROR_KEYS[section];
      if (keys.some((key) => !!errors[key])) return section;
    }
    return null;
  };

  const handleBack = (): void => {
    navigation.replace("Step2Equipment");
  };

  const handleFinish = async (): Promise<void> => {
    setAttempted(3);

    const validation = validateStep(3, draft);
    setFieldErrors(validation.fieldErrors);

    if (!validation.isValid || under18Selected) {
      await hapticHeavy();
      const firstInvalid = firstInvalidSection(validation.fieldErrors);
      if (firstInvalid) {
        scrollToSection(firstInvalid);
      }
      return;
    }

    if (!profileId) {
      await hapticHeavy();
      setFieldErrors({ preferredDays: "Unable to save profile right now. Please retry." });
      scrollToSection("preferredDays");
      return;
    }

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        preferredDays: draft.preferredDays,
        minutesPerSession: draft.minutesPerSession,
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        sex: draft.sex,
        ageRange: draft.ageRange,
        scheduleConstraints: normalizeText(draft.scheduleConstraints),
        onboardingStepCompleted: 3,
        onboardingCompletedAt: new Date().toISOString(),
      });
      navigation.navigate("ProgramReview");
    } catch {
      await hapticHeavy();
      setFieldErrors({ preferredDays: "Unable to save this step. Please try again." });
      scrollToSection("preferredDays");
    } finally {
      setIsSaving(false);
    }
  };

  const finishDisabled = isSaving || under18Selected;

  return (
    <OnboardingScaffold
      step={3}
      title="Schedule and metrics"
      subtitle="Set your schedule and body metrics so we can personalize volume and pacing."
      errorBannerVisible={attemptedStep3 && Object.keys(fieldErrors).length > 0}
      onBack={handleBack}
      onNext={() => {
        void handleFinish();
      }}
      nextLabel="Finish"
      nextDisabled={finishDisabled}
      isSaving={isSaving}
      scrollViewRef={scrollRef}
    >
      <Animated.View onLayout={recordSectionLayout("preferredDays")} style={preferredDaysPulse.animatedStyle}>
        <SectionCard title="Preferred training days" subtitle="Select at least one day.">
          <DayChipRow days={dayOptions} selectedValues={draft.preferredDays} onToggle={togglePreferredDay} />
          {fieldErrors.preferredDays ? <Text style={styles.amberErrorText}>{fieldErrors.preferredDays}</Text> : null}
        </SectionCard>
      </Animated.View>

      <Animated.View onLayout={recordSectionLayout("sessionSettings")} style={sessionSettingsPulse.animatedStyle}>
        <SectionCard title="Session settings" subtitle="Tell us your default session setup.">
          <SelectField
            label="Minutes per session"
            valueLabel={draft.minutesPerSession == null ? undefined : `${draft.minutesPerSession} min`}
            placeholder="Choose duration"
            options={minuteOptions}
            onSelect={handleMinutesSelect}
            error={fieldErrors.minutesPerSession}
          />

          <SelectField
            label="Sex"
            valueLabel={draft.sex ?? undefined}
            placeholder="Select sex"
            options={sexOptions}
            onSelect={handleSexSelect}
            error={fieldErrors.sex}
          />

          <SelectField
            label="Age range"
            valueLabel={draft.ageRange ?? undefined}
            placeholder="Select age range"
            options={ageRangeOptions}
            onSelect={handleAgeRangeSelect}
            error={fieldErrors.ageRange}
          />

          {under18Selected ? (
            <Text style={styles.blockingErrorText}>You must be 18 or older to continue.</Text>
          ) : null}
        </SectionCard>
      </Animated.View>

      <Animated.View onLayout={recordSectionLayout("bodyMetrics")} style={bodyMetricsPulse.animatedStyle}>
        <SectionCard title="Body metrics" subtitle="Used for plan calibration.">
          <NumericField
            label="Height (cm)"
            value={heightInput}
            onChangeText={handleHeightChange}
            placeholder="e.g. 175"
            error={fieldErrors.heightCm}
          />
          <NumericField
            label="Weight (kg)"
            value={weightInput}
            onChangeText={handleWeightChange}
            placeholder="e.g. 72.5"
            error={fieldErrors.weightKg}
          />
        </SectionCard>
      </Animated.View>

      <Animated.View
        onLayout={recordSectionLayout("scheduleConstraints")}
        style={scheduleConstraintsPulse.animatedStyle}
      >
        <SectionCard title="Schedule constraints" subtitle="Optional notes about your week.">
          <MultilineField
            label="Constraints"
            value={draft.scheduleConstraints}
            onChangeText={handleScheduleConstraintsChange}
            placeholder="Travel days, fixed class times, recovery constraints..."
            error={fieldErrors.scheduleConstraints}
          />
        </SectionCard>
      </Animated.View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  amberErrorText: {
    marginTop: spacing.xs,
    color: colors.warning,
    ...typography.small,
  },
  blockingErrorText: {
    marginTop: spacing.sm,
    color: "#F87171",
    ...typography.small,
    fontWeight: "600",
  },
});
