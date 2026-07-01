import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { Shell } from "../components/Shell";
import { SideStepper } from "../components/SideStepper";
import { TimeInput } from "../components/TimeInput";
import { trackEvent } from "../utils/api";
import { getJourneyVariant, type JourneyVariant } from "../utils/journeyUtils";
import { loadDraft, saveDraft } from "../utils/storage";
import { formatSeconds, normalizeTimeInputValue, parseTimeToSeconds } from "../utils/time";
import styles from "./TargetCalibrationStep2Page.module.css";

const CALIBRATION_STEPS = [
  { label: "Race Details" },
  { label: "Splits" },
  { label: "Fitness" },
  { label: "Benchmarks" },
  { label: "Review" },
];

function numberText(value?: number): string {
  return value ? String(value) : "";
}

function timeText(value?: number): string {
  return value ? formatSeconds(value) : "";
}

export function TargetCalibrationStep2Page() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const variant: JourneyVariant = getJourneyVariant(draft);
  const ctx = draft?.athleteContext ?? {};
  const source = draft?.meta?.source ?? "public";
  const heading = variant === "target-direct" ? "Optional HYROX benchmarks" : "Optional HYROX benchmarks";
  const subtitle =
    variant === "target-direct"
      ? "Add any recent HYROX-specific benchmarks you know. Skip anything you don't track."
      : "Add any recent HYROX-specific benchmarks you know. Skip anything you do not track.";

  const [rowTime, setRowTime] = useState(timeText(ctx.rowErg2kSeconds));
  const [skiTime, setSkiTime] = useState(timeText(ctx.skiErg1kSeconds));
  const [wallBalls, setWallBalls] = useState(numberText(ctx.wallBallRepsIn2Min));
  const [farmerTime, setFarmerTime] = useState(timeText(ctx.farmerCarry200mSeconds));
  const [raceDate, setRaceDate] = useState(ctx.targetRaceDate ?? "");

  useEffect(() => {
    if (variant === "analyse") {
      navigate("/hyrox-calculator/race-details", { replace: true });
      return;
    }
    trackEvent("target_calibration_step2_reached", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildUpdatedContext() {
    return {
      ...loadDraft()?.athleteContext,
      rowErg2kSeconds: parseTimeToSeconds(rowTime) ?? undefined,
      skiErg1kSeconds: parseTimeToSeconds(skiTime) ?? undefined,
      wallBallRepsIn2Min: wallBalls ? Number(wallBalls) : undefined,
      farmerCarry200mSeconds: parseTimeToSeconds(farmerTime) ?? undefined,
      targetRaceDate: raceDate || undefined,
    };
  }

  function handleContinue() {
    const nextContext = buildUpdatedContext();
    saveDraft({
      athleteContext: nextContext,
      meta: { ...loadDraft()?.meta, calibrationCompleted: true },
    });
    trackEvent("target_calibration_step2_completed", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
      hasRowTime: !!nextContext.rowErg2kSeconds,
      hasSkiTime: !!nextContext.skiErg1kSeconds,
      hasWallBalls: !!nextContext.wallBallRepsIn2Min,
      hasFarmerCarry: !!nextContext.farmerCarry200mSeconds,
      hasTargetRaceDate: !!nextContext.targetRaceDate,
      benchmarkFieldsCompleted: [
        nextContext.rowErg2kSeconds,
        nextContext.skiErg1kSeconds,
        nextContext.wallBallRepsIn2Min,
        nextContext.farmerCarry200mSeconds,
        nextContext.targetRaceDate,
      ].filter(Boolean).length,
    });
    void navigate("/hyrox-calculator/review");
  }

  function handleSkip() {
    saveDraft({
      athleteContext: buildUpdatedContext(),
      meta: { ...loadDraft()?.meta, calibrationSkipped: true },
    });
    trackEvent("target_calibration_step2_skipped", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
    });
    void navigate("/hyrox-calculator/review");
  }

  if (variant === "analyse") return null;

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={4} steps={CALIBRATION_STEPS} />
        <div className={styles.layout}>
          <FormPanel className={styles.panel}>
            <div className={styles.eyebrow}>Calibrate your target plan</div>
            <h1 className={styles.heading}>{heading}</h1>
            <p className={styles.body}>{subtitle}</p>
            {variant === "target-direct" && (
              <p className={styles.body}>
                These are optional, but they help sharpen your target-time analysis and training focus.
              </p>
            )}

            <button type="button" className={styles.skipLinkTop} onClick={handleSkip}>
              Skip optional benchmarks -&gt;
            </button>

            <div className={styles.fields}>
              <div className={styles.row2}>
                <TimeInput
                  label="2k row time"
                  hint="Optional - Concept2 or equivalent"
                  value={rowTime}
                  onChange={(event) => setRowTime(event.target.value)}
                  onBlur={(event) => setRowTime(normalizeTimeInputValue(event.target.value))}
                  placeholder="7:30"
                />
                <TimeInput
                  label="1k SkiErg time"
                  hint="Optional - indoors"
                  value={skiTime}
                  onChange={(event) => setSkiTime(event.target.value)}
                  onBlur={(event) => setSkiTime(normalizeTimeInputValue(event.target.value))}
                  placeholder="4:00"
                />
              </div>
              <div className={styles.row2}>
                <NumberField label="Wall balls in 2 min (reps)" hint="Optional - at 9 kg / 20 lb" value={wallBalls} onChange={setWallBalls} min={1} max={150} />
                <TimeInput
                  label="Farmer's carry 200m time"
                  hint="Optional - 2 x 24 kg / 53 lb"
                  value={farmerTime}
                  onChange={(event) => setFarmerTime(event.target.value)}
                  onBlur={(event) => setFarmerTime(normalizeTimeInputValue(event.target.value))}
                  placeholder="1:45"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="target-race-date" className={styles.fieldLabel}>
                  Target race date
                </label>
                <p className={styles.fieldHint}>Optional - helps personalise your plan</p>
                <input
                  id="target-race-date"
                  type="date"
                  value={raceDate}
                  onChange={(event) => setRaceDate(event.target.value)}
                  className={styles.dateInput}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <SecondaryButton type="button" onClick={() => void navigate("/hyrox-calculator/target-calibration")}>
                Back
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleContinue}>
                Continue to target plan
              </PrimaryButton>
            </div>
            <button type="button" className={styles.skipLink} onClick={handleSkip}>
              Skip optional benchmarks -&gt;
            </button>
          </FormPanel>

          <FormPanel className={styles.sidePanel}>
            <div className={styles.sideKicker}>Optional, useful</div>
            <h2 className={styles.sideTitle}>Benchmarks refine the station read</h2>
            <p className={styles.sideCopy}>
              These markers help Forma understand whether station gaps are limited by raw capacity, repeatability, or race execution.
            </p>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className={styles.numberField}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
      <span>{hint}</span>
    </div>
  );
}
