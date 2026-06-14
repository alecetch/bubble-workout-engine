import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { ContextQuestionCard } from "../components/ContextQuestionCard";
import { OptionCardGroup } from "../components/OptionCardGroup";
import { TimeInput } from "../components/TimeInput";
import { PrivacyNotice } from "../components/PrivacyNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SideStepper } from "../components/SideStepper";
import { loadDraft, saveDraft } from "../utils/storage";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { trackEvent } from "../utils/api";
import styles from "./AthleteContextPage.module.css";

export function AthleteContextPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const ctx = draft?.athleteContext ?? {};

  const [trainingAge, setTrainingAge] = useState(ctx.trainingAge ?? "");
  const [primaryBackground, setPrimaryBackground] = useState(
    ctx.primaryBackground ?? "",
  );
  const [weeklyRunningVolume, setWeeklyRunningVolume] = useState(
    ctx.weeklyRunningVolume ?? "",
  );
  const [weeklyStrengthSessions, setWeeklyStrengthSessions] = useState(
    ctx.weeklyStrengthSessions ?? "",
  );
  const [targetTime, setTargetTime] = useState(
    ctx.targetFinishTimeSeconds
      ? formatSeconds(ctx.targetFinishTimeSeconds, "HH:MM:SS")
      : "",
  );
  const [additionalContext, setAdditionalContext] = useState(
    ctx.additionalContext ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!trainingAge) errs.trainingAge = "Please select an option.";
    if (!primaryBackground) errs.primaryBackground = "Please select an option.";
    if (!weeklyRunningVolume)
      errs.weeklyRunningVolume = "Please select an option.";
    if (!weeklyStrengthSessions)
      errs.weeklyStrengthSessions = "Please select an option.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validate()) return;

    const targetSeconds = targetTime
      ? (parseTimeToSeconds(targetTime) ?? undefined)
      : undefined;

    saveDraft({
      athleteContext: {
        trainingAge,
        primaryBackground,
        weeklyRunningVolume,
        weeklyStrengthSessions,
        targetFinishTimeSeconds: targetSeconds,
        additionalContext: additionalContext.trim() || undefined,
      },
    });
    trackEvent("athlete_context_completed");
    void navigate("/hyrox-calculator/review");
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={3} />

        <div className={styles.intro}>
          <h2 className={styles.introHeadline}>Almost there.</h2>
          <p className={styles.introCopy}>
            A few more details to personalise your analysis. This helps us
            provide more accurate benchmarks, identify your likely limiters, and
            give you training recommendations that fit your background.
          </p>
        </div>

        <FormPanel>
          <div className={styles.grid}>
            <ContextQuestionCard
              question="How long have you been training seriously for HYROX or similar events?"
              required
            >
              <OptionCardGroup
                label=""
                options={[
                  { value: "lt_1_year", label: "< 1 year" },
                  { value: "1_3_years", label: "1–3 years" },
                  { value: "3_5_years", label: "3–5 years" },
                  { value: "5_plus_years", label: "5+ years" },
                ]}
                value={trainingAge}
                onChange={setTrainingAge}
              />
              {errors.trainingAge && (
                <p style={{ color: "var(--accent-red)", fontSize: 12, marginTop: 8 }}>
                  {errors.trainingAge}
                </p>
              )}
            </ContextQuestionCard>

            <ContextQuestionCard
              question="What is your main athletic background?"
              required
            >
              <OptionCardGroup
                label=""
                options={[
                  { value: "running", label: "Running" },
                  { value: "crossfit", label: "CrossFit" },
                  { value: "strength_sports", label: "Strength sports" },
                  { value: "team_sports", label: "Team sports" },
                  { value: "other", label: "Other" },
                ]}
                value={primaryBackground}
                onChange={setPrimaryBackground}
              />
              {errors.primaryBackground && (
                <p style={{ color: "var(--accent-red)", fontSize: 12, marginTop: 8 }}>
                  {errors.primaryBackground}
                </p>
              )}
            </ContextQuestionCard>

            <ContextQuestionCard
              question="On average, how many kilometres do you run per week?"
              required
            >
              <OptionCardGroup
                label=""
                options={[
                  { value: "0_10_km", label: "0–10 km" },
                  { value: "11_20_km", label: "11–20 km" },
                  { value: "21_40_km", label: "21–40 km" },
                  { value: "41_60_km", label: "41–60 km" },
                  { value: "60_plus_km", label: "60+ km" },
                ]}
                value={weeklyRunningVolume}
                onChange={setWeeklyRunningVolume}
              />
              {errors.weeklyRunningVolume && (
                <p style={{ color: "var(--accent-red)", fontSize: 12, marginTop: 8 }}>
                  {errors.weeklyRunningVolume}
                </p>
              )}
            </ContextQuestionCard>

            <ContextQuestionCard
              question="On average, how many strength training sessions do you do per week?"
              required
            >
              <OptionCardGroup
                label=""
                options={[
                  { value: "0_1", label: "0–1" },
                  { value: "2_3", label: "2–3" },
                  { value: "4_5", label: "4–5" },
                  { value: "6_plus", label: "6+" },
                ]}
                value={weeklyStrengthSessions}
                onChange={setWeeklyStrengthSessions}
              />
              {errors.weeklyStrengthSessions && (
                <p style={{ color: "var(--accent-red)", fontSize: 12, marginTop: 8 }}>
                  {errors.weeklyStrengthSessions}
                </p>
              )}
            </ContextQuestionCard>

            <div className={styles.fullWidth}>
              <TimeInput
                label="Target Finish Time (optional)"
                placeholder="e.g. 1:15:00"
                hint="What is your target for your next HYROX?"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
              />
            </div>

            <div className={styles.fullWidth}>
              <div className={styles.timeLabel}>
                Anything else we should know? (optional)
              </div>
              <textarea
                className={styles.textarea}
                placeholder="e.g. Recent shoulder irritation, training after injury, first HYROX..."
                maxLength={500}
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
              />
              <div className={styles.charCount}>
                {additionalContext.length}/500
              </div>
            </div>
          </div>

          <PrivacyNotice />

          <div className={styles.actions}>
            <SecondaryButton
              type="button"
              onClick={() => void navigate("/hyrox-calculator/splits")}
            >
              ← Back
            </SecondaryButton>
            <PrimaryButton type="button" onClick={handleNext}>
              Get My Analysis →
            </PrimaryButton>
          </div>
        </FormPanel>
      </div>
    </Shell>
  );
}
