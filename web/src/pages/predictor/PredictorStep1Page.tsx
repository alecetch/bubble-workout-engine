import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormPanel } from "../../components/FormPanel";
import { HeightField } from "../../components/HeightField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SelectInput } from "../../components/SelectInput";
import { Shell } from "../../components/Shell";
import { SideStepper } from "../../components/SideStepper";
import { TextInput } from "../../components/TextInput";
import { TimeInput } from "../../components/TimeInput";
import { WeightField } from "../../components/WeightField";
import { PREDICTOR_STEPS } from "../../data/predictorSteps";
import { REP_OPTIONS } from "../../data/repOptions";
import type { HyroxAgeGroup, HyroxDivision, HyroxSex } from "../../types";
import { trackEvent } from "../../utils/api";
import { loadPredictorDraft, savePredictorDraft } from "../../utils/predictorStorage";
import { formatSeconds, parseTimeToSeconds } from "../../utils/time";
import styles from "./PredictorPages.module.css";

const AGE_OPTIONS = [
  { value: "", label: "Select range" },
  { value: "18-24", label: "18-24" },
  { value: "25-29", label: "25-29" },
  { value: "30-34", label: "30-34" },
  { value: "35-39", label: "35-39" },
  { value: "40-44", label: "40-44" },
  { value: "45-49", label: "45-49" },
  { value: "50-54", label: "50-54" },
  { value: "55-59", label: "55-59" },
  { value: "60-64", label: "60-64" },
  { value: "65-69", label: "65-69" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

function timeText(value?: number): string {
  return value ? formatSeconds(value) : "";
}

export function PredictorStep1Page() {
  const navigate = useNavigate();
  const draft = loadPredictorDraft();
  const [sex, setSex] = useState<HyroxSex>(draft.athlete.sex);
  const [ageGroup, setAgeGroup] = useState(draft.athlete.ageGroup ?? "");
  const [division, setDivision] = useState<HyroxDivision>(draft.athlete.division);
  const [run5k, setRun5k] = useState(timeText(draft.benchmarks.run5kSeconds));
  const [run10k, setRun10k] = useState(timeText(draft.benchmarks.run10kSeconds));
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">(draft.athlete.weightUnit ?? "kg");
  const [backSquatKg, setBackSquatKg] = useState<number | undefined>(draft.benchmarks.backSquat3RM);
  const [backSquatReps, setBackSquatReps] = useState(draft.benchmarks.backSquatReps ?? 3);
  const [deadliftKg, setDeadliftKg] = useState<number | undefined>(draft.benchmarks.deadlift3RM);
  const [deadliftReps, setDeadliftReps] = useState(draft.benchmarks.deadliftReps ?? 3);
  const [bodyweightKg, setBodyweightKg] = useState<number | undefined>(draft.benchmarks.bodyweightKg);
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">(draft.athlete.heightUnit ?? "cm");
  const [heightCm, setHeightCm] = useState<number | undefined>(draft.benchmarks.heightCm);
  const [name, setName] = useState(draft.athlete.name ?? "");

  const run5kSeconds = parseTimeToSeconds(run5k);
  const run10kSeconds = parseTimeToSeconds(run10k);
  const errors: Record<string, string> = {};

  if (!ageGroup) errors.ageGroup = "Select your age group.";
  if (!run5k || run5kSeconds === null || run5kSeconds >= 3600) errors.run5k = "Enter a 5k time under 60:00.";
  if (!backSquatKg || backSquatKg <= 0 || backSquatKg > 400) errors.backSquat = "Enter a back squat between 1-400 kg (2-882 lb).";
  if (!deadliftKg || deadliftKg <= 0 || deadliftKg > 500) errors.deadlift = "Enter a deadlift between 1-500 kg (2-1102 lb).";
  if (!bodyweightKg || bodyweightKg < 30 || bodyweightKg > 250) {
    errors.bodyweightKg = "Enter a bodyweight between 30-250 kg (66-551 lb).";
  }
  if (heightCm !== undefined && (heightCm < 120 || heightCm > 230)) {
    errors.heightCm = "Enter a height between 120-230 cm (3'11\"-7'6\").";
  }
  if (run10k && (run10kSeconds === null || (run5kSeconds !== null && run10kSeconds <= run5kSeconds))) {
    errors.run10k = "10k time must be slower than your 5k time.";
  }

  const isValid = Object.keys(errors).filter((key) => key !== "run10k").length === 0 && !errors.run10k;
  const completenessLabel = run10kSeconds ? "Better prediction" : "Minimum prediction";

  function handleNext() {
    if (!isValid || !run5kSeconds || !backSquatKg || !deadliftKg || !bodyweightKg) return;
    savePredictorDraft({
      athlete: {
        name: name.trim() || undefined,
        sex,
        ageGroup: ageGroup as HyroxAgeGroup,
        division,
        weightUnit,
        heightUnit,
      },
      benchmarks: {
        run5kSeconds,
        run10kSeconds: run10kSeconds ?? undefined,
        backSquat3RM: backSquatKg,
        backSquatReps,
        deadlift3RM: deadliftKg,
        deadliftReps,
        bodyweightKg,
        heightCm,
      },
    });
    void navigate("/hyrox-predictor/benchmarks");
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={1} steps={PREDICTOR_STEPS} />
        <div className={styles.layout}>
          <FormPanel className={styles.panel}>
            <div className={styles.header}>
              <div className={styles.eyebrow}>Step 1 of 3</div>
              <h1>Your benchmarks</h1>
              <p>Add the minimum data needed to estimate a HYROX finish time.</p>
            </div>
            <p className={styles.crossLink}>
              Already completed a HYROX?{" "}
              <Link
                to="/hyrox-calculator"
                onClick={() => trackEvent("predictor_crosslink_clicked", { source: "predictor_step1" })}
              >
                Analyse your race instead -&gt;
              </Link>
            </p>
            <div className={styles.fields}>
              <div className={styles.row2}>
                <SegmentedControl
                  label="Sex"
                  required
                  options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                  value={sex}
                  onChange={(value) => setSex(value as HyroxSex)}
                />
                <SelectInput
                  label="Age group"
                  required
                  options={AGE_OPTIONS}
                  value={ageGroup}
                  onChange={(event) => setAgeGroup(event.target.value)}
                  error={errors.ageGroup}
                />
              </div>
              <SegmentedControl
                label="Division"
                required
                options={[
                  { value: "open", label: "Open" },
                  { value: "pro", label: "Pro" },
                  { value: "doubles", label: "Doubles" },
                  { value: "relay", label: "Relay" },
                ]}
                value={division}
                onChange={(value) => setDivision(value as HyroxDivision)}
              />
              <div className={styles.row2}>
                <TimeInput label="Best 5k time" required placeholder="22:30" value={run5k} onChange={(event) => setRun5k(event.target.value)} error={errors.run5k} />
                <TimeInput label="Best 10k time" placeholder="48:00" hint="Optional" value={run10k} onChange={(event) => setRun10k(event.target.value)} error={errors.run10k} />
              </div>
              <SegmentedControl
                label="Weight unit"
                options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                value={weightUnit}
                onChange={(value) => setWeightUnit(value as "kg" | "lb")}
              />
              <div className={styles.row2}>
                <WeightField
                  label={`Back squat ${backSquatReps}RM`}
                  required
                  valueKg={backSquatKg}
                  unit={weightUnit}
                  onChangeKg={setBackSquatKg}
                  min={1}
                  max={400}
                  error={errors.backSquat}
                />
                <WeightField
                  label={`Deadlift ${deadliftReps}RM`}
                  required
                  valueKg={deadliftKg}
                  unit={weightUnit}
                  onChangeKg={setDeadliftKg}
                  min={1}
                  max={500}
                  error={errors.deadlift}
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
                onChangeKg={setBodyweightKg}
                min={30}
                max={250}
                error={errors.bodyweightKg}
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
                error={errors.heightCm}
                hint="Optional - not used in your prediction yet"
              />
              <TextInput label="Your name" placeholder="Optional" value={name} onChange={(event) => setName(event.target.value)} />
              <div className={styles.actions}>
                <span />
                <PrimaryButton type="button" onClick={handleNext} disabled={!isValid}>Next</PrimaryButton>
              </div>
            </div>
          </FormPanel>
          <FormPanel className={styles.sidePanel}>
            <div className={styles.sectionTitle}>Prediction completeness</div>
            <h2>{completenessLabel}</h2>
            <div className={styles.meter}><div className={styles.meterFill} style={{ width: run10kSeconds ? "62%" : "42%" }} /></div>
            <p>Minimum prediction uses sex, age group, division, 5k time, squat, and deadlift. Add a 10k time for a better endurance signal.</p>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
