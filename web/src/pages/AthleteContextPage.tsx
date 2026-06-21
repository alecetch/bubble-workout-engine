import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ContextQuestionCard } from "../components/ContextQuestionCard";
import { FormPanel } from "../components/FormPanel";
import { OptionCardGroup } from "../components/OptionCardGroup";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { Shell } from "../components/Shell";
import { SideStepper } from "../components/SideStepper";
import { trackEvent } from "../utils/api";
import { loadDraft, saveDraft } from "../utils/storage";
import { formatSeconds } from "../utils/time";
import styles from "./AthleteContextPage.module.css";

function formatDivisionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSignedTime(seconds: number): string {
  if (seconds === 0) return "0:00";
  return `${seconds > 0 ? "+" : "-"}${formatSeconds(Math.abs(seconds))}`;
}

export function AthleteContextPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const ctx = draft?.athleteContext ?? {};

  const [trainingFrequency, setTrainingFrequency] = useState(ctx.weeklyStrengthSessions ?? ctx.trainingAge ?? "");
  const [primaryBackground, setPrimaryBackground] = useState(ctx.primaryBackground ?? "");
  const [weeklyRunningVolume, setWeeklyRunningVolume] = useState(ctx.weeklyRunningVolume ?? "");
  const [additionalContext, setAdditionalContext] = useState(ctx.additionalContext ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);

  const splitCount = (draft?.splits ?? []).filter((split) => split.timeSeconds > 0).length;
  const splitTotal = (draft?.splits ?? []).reduce((sum, split) => sum + (split.timeSeconds ?? 0), 0);
  const officialRoxzone = draft?.roxzoneTimeSeconds ?? (
    draft?.race?.finishTimeSeconds && splitTotal > 0
      ? draft.race.finishTimeSeconds - splitTotal
      : null
  );
  const replayRows = (draft?.raceReplay ?? []).filter((row) => row.entrySeconds !== null && row.exitSeconds !== null);
  const replayRoxzone = replayRows.reduce((sum, row) => sum + (row.entrySeconds ?? 0) + (row.exitSeconds ?? 0), 0);
  const roxzoneVariance = officialRoxzone != null && replayRows.length > 0 ? officialRoxzone - replayRoxzone : null;
  const requiredSectionsComplete = [
    trainingFrequency,
    weeklyRunningVolume,
    primaryBackground,
  ].filter(Boolean).length;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!trainingFrequency) errs.trainingFrequency = "Please select an option.";
    if (!weeklyRunningVolume) errs.weeklyRunningVolume = "Please select an option.";
    if (!primaryBackground) errs.primaryBackground = "Please select an option.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    setHasAttemptedContinue(true);
    if (!validate()) return;

    saveDraft({
      athleteContext: {
        primaryBackground,
        weeklyRunningVolume,
        weeklyStrengthSessions: trainingFrequency,
        targetFinishTimeSeconds: ctx.targetFinishTimeSeconds,
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
          <div>
            <h1 className={styles.introHeadline}>Add training context</h1>
            <p className={styles.introCopy}>
              This makes the report more useful. Your splits show what happened; context helps explain why.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={[styles.statusChip, styles.stepChip].join(" ")}>STEP 3 OF 4</span>
            <span className={[styles.statusChip, styles.goodChip].join(" ")}>Takes 60 seconds</span>
            <span className={[styles.statusChip, styles.neutralChip].join(" ")}>Optional notes</span>
          </div>
        </div>

        <div className={styles.layout}>
          <FormPanel className={styles.contextPanel}>
            <div className={styles.grid}>
              <ContextQuestionCard number={1} question="How often do you currently train?" required>
                <OptionCardGroup
                  label=""
                  options={[
                    { value: "2_3_days_week", label: "2-3 days/week", sublabel: "maintenance" },
                    { value: "4_5_days_week", label: "4-5 days/week", sublabel: "consistent" },
                    { value: "6_plus_days_week", label: "6+ days/week", sublabel: "high volume" },
                  ]}
                  value={trainingFrequency}
                  onChange={(value) => {
                    setTrainingFrequency(value);
                    setErrors((prev) => ({ ...prev, trainingFrequency: "" }));
                  }}
                />
                {hasAttemptedContinue && errors.trainingFrequency && <p className={styles.errorText}>{errors.trainingFrequency}</p>}
              </ContextQuestionCard>

              <ContextQuestionCard number={2} question="What is your current running volume?" required>
                <OptionCardGroup
                  label=""
                  options={[
                    { value: "under_15_km", label: "Under 15 km", sublabel: "low" },
                    { value: "15_30_km", label: "15-30 km", sublabel: "moderate" },
                    { value: "30_45_km", label: "30-45 km", sublabel: "strong" },
                    { value: "45_plus_km", label: "45+ km", sublabel: "high" },
                  ]}
                  value={weeklyRunningVolume}
                  onChange={(value) => {
                    setWeeklyRunningVolume(value);
                    setErrors((prev) => ({ ...prev, weeklyRunningVolume: "" }));
                  }}
                />
                {hasAttemptedContinue && errors.weeklyRunningVolume && <p className={styles.errorText}>{errors.weeklyRunningVolume}</p>}
              </ContextQuestionCard>

              <ContextQuestionCard number={3} question="What best describes your strength background?" required>
                <OptionCardGroup
                  label=""
                  options={[
                    { value: "new_to_strength", label: "New to strength", sublabel: "needs base" },
                    { value: "general_gym", label: "General gym", sublabel: "solid" },
                    { value: "crossfit_hybrid", label: "CrossFit / hybrid", sublabel: "specific" },
                    { value: "strength_sport", label: "Strength sport", sublabel: "power bias" },
                  ]}
                  value={primaryBackground}
                  onChange={(value) => {
                    setPrimaryBackground(value);
                    setErrors((prev) => ({ ...prev, primaryBackground: "" }));
                  }}
                />
                {hasAttemptedContinue && errors.primaryBackground && <p className={styles.errorText}>{errors.primaryBackground}</p>}
              </ContextQuestionCard>

              <ContextQuestionCard number={4} question="Anything we should account for?">
                <textarea
                  className={styles.textarea}
                  placeholder="Injuries, penalties, recent illness, compromised stations, equipment limitations, or anything unusual about race day."
                  maxLength={500}
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
                <div className={styles.charCount}>Optional &middot; {additionalContext.length}/500</div>
              </ContextQuestionCard>
            </div>

            <div className={styles.actions}>
              <div className={requiredSectionsComplete >= 3 ? styles.actionStatusGood : styles.actionStatusWarn}>
                {requiredSectionsComplete}/3 required sections complete
              </div>
              <SecondaryButton
                type="button"
                className={styles.compactButton}
                onClick={() => void navigate("/hyrox-calculator/splits")}
              >
                Back
              </SecondaryButton>
              <PrimaryButton type="button" className={styles.compactButton} onClick={handleNext}>
                Review My Inputs
              </PrimaryButton>
            </div>
          </FormPanel>

          <div className={styles.sideCol}>
            <FormPanel className={styles.whyPanel}>
              <div className={styles.sideKicker}>WHY THIS MATTERS</div>
              <h2 className={styles.sideTitle}>Context changes the advice</h2>
              <p className={styles.sideCopy}>
                Two athletes can have the same split loss for different reasons. This step helps Forma tell the difference.
              </p>
              <div className={styles.reasonRows}>
                <ReasonRow title="Running volume" copy="Separates under-trained run fitness from race-day pacing." />
                <ReasonRow title="Strength background" copy="Explains whether station gaps are skill, strength or fatigue." />
                <ReasonRow title="Training frequency" copy="Keeps recommendations realistic for your week." />
                <ReasonRow title="Notes" copy="Catches injuries, penalties and race-specific context." />
              </div>
            </FormPanel>
            <FormPanel className={styles.dataPanel}>
              <div className={styles.sideKicker}>DATA ALREADY CAPTURED</div>
              <DataRow label="Race" value={draft?.race?.division ? `HYROX ${formatDivisionLabel(draft.race.division)}` : "HYROX"} />
              <DataRow label="Finish" value={draft?.race?.finishTimeSeconds ? formatSeconds(draft.race.finishTimeSeconds) : "-"} />
              <DataRow label="Target" value={ctx.targetFinishTimeSeconds ? formatSeconds(ctx.targetFinishTimeSeconds) : "-"} />
              <DataRow label="Splits" value={`${splitCount}/16 complete`} />
              <DataRow label="RoxZone" value={roxzoneVariance != null ? `${formatSignedTime(roxzoneVariance)} variance` : "-"} />
            </FormPanel>
          </div>
        </div>

        <div className={styles.stickyCta}>
          <PrimaryButton type="button" fullWidth onClick={handleNext}>
            Review My Inputs
          </PrimaryButton>
        </div>
      </div>
    </Shell>
  );
}

function ReasonRow({ title, copy }: { title: string; copy: string }) {
  return (
    <div className={styles.reasonRow}>
      <div className={styles.reasonTitle}>{title}</div>
      <div className={styles.reasonCopy}>{copy}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.dataRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
