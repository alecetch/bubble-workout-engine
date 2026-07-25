import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { HeightField } from "../components/HeightField";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { SelectInput } from "../components/SelectInput";
import { Shell } from "../components/Shell";
import { SideStepper } from "../components/SideStepper";
import { TimeInput } from "../components/TimeInput";
import { WeightField } from "../components/WeightField";
import { REP_OPTIONS } from "../data/repOptions";
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
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">(draft?.weightUnit ?? "kg");
  const [backSquatKg, setBackSquatKg] = useState<number | undefined>(ctx.backSquat3RMKg);
  const [backSquatReps, setBackSquatReps] = useState(ctx.backSquatReps ?? 3);
  const [deadliftKg, setDeadliftKg] = useState<number | undefined>(ctx.deadlift3RMKg);
  const [deadliftReps, setDeadliftReps] = useState(ctx.deadliftReps ?? 3);
  const [bodyweightKg, setBodyweightKg] = useState<number | undefined>(ctx.bodyweightKg);
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">(draft?.heightUnit ?? "cm");
  const [heightCm, setHeightCm] = useState<number | undefined>(ctx.heightCm);
  const [missingFieldsWarning, setMissingFieldsWarning] = useState<string[]>([]);

  const bodyweightError = bodyweightKg !== undefined && (bodyweightKg < 30 || bodyweightKg > 250)
    ? "Enter a bodyweight between 30-250 kg (66-551 lb)."
    : undefined;
  const heightError = heightCm !== undefined && (heightCm < 120 || heightCm > 230)
    ? "Enter a height between 120-230 cm (3'11\"-7'6\")."
    : undefined;

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
      backSquat3RMKg: backSquatKg,
      backSquatReps,
      deadlift3RMKg: deadliftKg,
      deadliftReps,
      bodyweightKg,
      heightCm,
    };
  }

  function handleContinue() {
    const parsed5k = parseTimeToSeconds(run5k);
    const missing: string[] = [];
    if (!parsed5k) missing.push("your best 5k time");
    if (bodyweightKg === undefined) missing.push("your bodyweight");
    if (missing.length > 0) {
      setMissingFieldsWarning(missing);
      return;
    }
    if (bodyweightError || heightError) return;
    const nextContext = updatedContext();
    saveDraft({ athleteContext: nextContext, weightUnit, heightUnit });
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
      weightUnit,
      heightUnit,
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
                  setMissingFieldsWarning([]);
                }}
                onBlur={(event) => setRun5k(normalizeTimeInputValue(event.target.value))}
                placeholder="22:30"
              />
              {missingFieldsWarning.length > 0 && (
                <p className={styles.softWarning}>
                  Add {missingFieldsWarning.join(" and ")} to continue, or skip this step for now.
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
              <SegmentedControl
                label="Weight unit"
                options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                value={weightUnit}
                onChange={(value) => setWeightUnit(value as "kg" | "lb")}
              />
              <div className={styles.row2}>
                <WeightField
                  label={`Back squat ${backSquatReps}RM`}
                  hint={`Optional - heaviest set of ${backSquatReps} rep${backSquatReps === 1 ? "" : "s"}`}
                  valueKg={backSquatKg}
                  unit={weightUnit}
                  onChangeKg={setBackSquatKg}
                  min={1}
                  max={400}
                />
                <WeightField
                  label={`Deadlift ${deadliftReps}RM`}
                  hint={`Optional - heaviest set of ${deadliftReps} rep${deadliftReps === 1 ? "" : "s"}`}
                  valueKg={deadliftKg}
                  unit={weightUnit}
                  onChangeKg={setDeadliftKg}
                  min={1}
                  max={500}
                />
              </div>
              <div className={styles.row2}>
                <SelectInput
                  label="Back squat rep count"
                  options={REP_OPTIONS}
                  value={String(backSquatReps)}
                  onChange={(event) => setBackSquatReps(Number(event.target.value))}
                />
                <SelectInput
                  label="Deadlift rep count"
                  options={REP_OPTIONS}
                  value={String(deadliftReps)}
                  onChange={(event) => setDeadliftReps(Number(event.target.value))}
                />
              </div>
              <WeightField
                label="Bodyweight"
                required
                valueKg={bodyweightKg}
                unit={weightUnit}
                onChangeKg={(value) => {
                  setBodyweightKg(value);
                  setMissingFieldsWarning([]);
                }}
                min={30}
                max={250}
                error={bodyweightError}
              />
              <SegmentedControl
                label="Height unit"
                options={[{ value: "cm", label: "cm" }, { value: "ftin", label: "ft-in" }]}
                value={heightUnit}
                onChange={(value) => setHeightUnit(value as "cm" | "ftin")}
              />
              <HeightField
                label="Height"
                valueCm={heightCm}
                unit={heightUnit}
                onChangeCm={setHeightCm}
                min={120}
                max={230}
                error={heightError}
                hint="Optional - not used in your prediction yet"
              />
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
