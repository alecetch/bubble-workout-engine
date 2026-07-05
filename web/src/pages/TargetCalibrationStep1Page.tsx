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
import styles from "./TargetCalibrationStep1Page.module.css";

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

export function TargetCalibrationStep1Page() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const variant: JourneyVariant = getJourneyVariant(draft);
  const ctx = draft?.athleteContext ?? {};
  const source = draft?.meta?.source ?? "public";
  const heading = variant === "target-direct" ? "Fitness markers" : "Current fitness markers";
  const subtitle =
    variant === "target-direct"
      ? "Add a few current fitness markers so Forma can estimate what needs to change to hit your target time."
      : "We already have your HYROX race data. Add a few current fitness markers so Forma can estimate what needs to change to hit your target.";

  const [run5k, setRun5k] = useState(timeText(ctx.run5kPbSeconds));
  const [run10k, setRun10k] = useState(timeText(ctx.run10kPbSeconds));
  const [backSquat, setBackSquat] = useState(numberText(ctx.backSquat3RMKg));
  const [deadlift, setDeadlift] = useState(numberText(ctx.deadlift3RMKg));
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  useEffect(() => {
    if (variant === "analyse") {
      navigate("/hyrox-calculator/race-details", { replace: true });
      return;
    }
    trackEvent("target_calibration_started", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updatedContext() {
    return {
      ...loadDraft()?.athleteContext,
      run5kPbSeconds: parseTimeToSeconds(run5k) ?? undefined,
      run10kPbSeconds: parseTimeToSeconds(run10k) ?? undefined,
      backSquat3RMKg: backSquat ? Number(backSquat) : undefined,
      deadlift3RMKg: deadlift ? Number(deadlift) : undefined,
    };
  }

  function handleContinue() {
    const parsed5k = parseTimeToSeconds(run5k);
    if (!parsed5k) {
      setShowSkipWarning(true);
      return;
    }
    const nextContext = updatedContext();
    saveDraft({ athleteContext: nextContext });
    trackEvent("target_calibration_step1_completed", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
      has5kTime: true,
      has10kTime: !!nextContext.run10kPbSeconds,
      hasBackSquat: !!nextContext.backSquat3RMKg,
      hasDeadlift: !!nextContext.deadlift3RMKg,
    });
    void navigate("/hyrox-calculator/target-benchmarks");
  }

  function handleBack() {
    void navigate(variant === "target-email" ? "/hyrox-calculator/splits" : "/hyrox-calculator/context");
  }

  function handleSkip() {
    saveDraft({
      athleteContext: updatedContext(),
      meta: { ...loadDraft()?.meta, calibrationSkipped: true },
    });
    trackEvent("target_calibration_step1_skipped", {
      source,
      journeyVariant: variant,
      sourceSubmissionId: draft?.meta?.sourceSubmissionId,
    });
    void navigate("/hyrox-calculator/target-benchmarks");
  }

  if (variant === "analyse") return null;

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={3} steps={CALIBRATION_STEPS} />
        <div className={styles.layout}>
          <FormPanel className={styles.panel}>
            <div className={styles.eyebrow}>Calibrate your target plan</div>
            <h1 className={styles.heading}>{heading}</h1>
            <p className={styles.body}>{subtitle}</p>
            {variant === "target-direct" && (
              <p className={styles.body}>
                We'll use these alongside your race splits to understand whether your target is mostly a running, strength or station-efficiency challenge.
              </p>
            )}

            <div className={styles.fields}>
              <TimeInput
                label="Best 5k time"
                value={run5k}
                onChange={(event) => {
                  setRun5k(event.target.value);
                  setShowSkipWarning(false);
                }}
                onBlur={(event) => setRun5k(normalizeTimeInputValue(event.target.value))}
                placeholder="22:30"
              />
              {showSkipWarning && (
                <p className={styles.softWarning}>
                  Your best 5k time helps us estimate your target potential. Add it for a better result.
                </p>
              )}
              <TimeInput
                label="Best 10k time"
                hint="Optional - improves prediction accuracy"
                value={run10k}
                onChange={(event) => setRun10k(event.target.value)}
                onBlur={(event) => setRun10k(normalizeTimeInputValue(event.target.value))}
                placeholder="48:00"
              />
              <div className={styles.row2}>
                <NumberField label="Back squat 3RM (kg)" hint="Optional - heaviest set of 3 reps" value={backSquat} onChange={setBackSquat} min={1} max={400} />
                <NumberField label="Deadlift 3RM (kg)" hint="Optional - heaviest set of 3 reps" value={deadlift} onChange={setDeadlift} min={1} max={500} />
              </div>
            </div>

            <div className={styles.actions}>
              <SecondaryButton type="button" onClick={handleBack}>
                Back
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleContinue}>
                Continue
              </PrimaryButton>
            </div>
            <button type="button" className={styles.skipLink} onClick={handleSkip}>
              Skip for now -&gt;
            </button>
          </FormPanel>

          <FormPanel className={styles.sidePanel}>
            <div className={styles.sideKicker}>What this changes</div>
            <h2 className={styles.sideTitle}>Fitness markers sharpen the route</h2>
            <p className={styles.sideCopy}>
              Race splits show where time was lost. Current run and strength markers help separate capacity gaps from execution gaps.
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
