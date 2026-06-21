import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormPanel } from "../../components/FormPanel";
import { OptionCardGroup } from "../../components/OptionCardGroup";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../../components/Shell";
import { SideStepper } from "../../components/SideStepper";
import { TimeInput } from "../../components/TimeInput";
import { PREDICTOR_STEPS } from "../../data/predictorSteps";
import type { HyroxPredictorDraft } from "../../types";
import { loadPredictorDraft, savePredictorDraft } from "../../utils/predictorStorage";
import { formatSeconds, parseTimeToSeconds } from "../../utils/time";
import styles from "./PredictorPages.module.css";

function timeText(value?: number): string {
  return value ? formatSeconds(value) : "";
}

function intValue(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function carryWeight(draft: HyroxPredictorDraft): string {
  if (draft.athlete.division === "pro") return draft.athlete.sex === "female" ? "2x 24 kg" : "2x 32 kg";
  return draft.athlete.sex === "female" ? "2x 16 kg" : "2x 24 kg";
}

function wallBallWeight(draft: HyroxPredictorDraft): string {
  return draft.athlete.sex === "female" ? "at 6 kg / 14 lb" : "at 9 kg / 20 lb";
}

export function PredictorStep2Page() {
  const navigate = useNavigate();
  const draft = loadPredictorDraft();
  const [row, setRow] = useState(timeText(draft.benchmarks.rowErg2kSeconds));
  const [ski, setSki] = useState(timeText(draft.benchmarks.skiErg1kSeconds));
  const [wallBalls, setWallBalls] = useState(draft.benchmarks.wallBallRepsIn2Min ? String(draft.benchmarks.wallBallRepsIn2Min) : "");
  const [carry, setCarry] = useState(timeText(draft.benchmarks.farmerCarryTimeSeconds));
  const [previousHyrox, setPreviousHyrox] = useState(timeText(draft.benchmarks.previousHyroxSeconds));
  const [trainingFrequency, setTrainingFrequency] = useState(draft.context.trainingFrequency ?? "");
  const [primaryBackground, setPrimaryBackground] = useState(draft.context.primaryBackground ?? "");
  const [weeklyRunningKm, setWeeklyRunningKm] = useState(draft.context.weeklyRunningKm ?? "");
  const [raceDate, setRaceDate] = useState(draft.race.raceDate ?? "");
  const [goalTime, setGoalTime] = useState(timeText(draft.race.targetFinishTimeSeconds));

  const previousSeconds = parseTimeToSeconds(previousHyrox);
  const wallBallReps = intValue(wallBalls);
  const errors: Record<string, string> = {};
  if (previousHyrox && (previousSeconds === null || previousSeconds < 3600 || previousSeconds > 18000)) {
    errors.previousHyrox = "Previous HYROX time should be between 1:00:00 and 5:00:00.";
  }
  if (wallBalls && (wallBallReps === undefined || wallBallReps < 1 || wallBallReps > 200)) {
    errors.wallBalls = "Enter a whole number from 1 to 200.";
  }

  function handleNext() {
    savePredictorDraft({
      benchmarks: {
        rowErg2kSeconds: parseTimeToSeconds(row) ?? undefined,
        skiErg1kSeconds: parseTimeToSeconds(ski) ?? undefined,
        wallBallRepsIn2Min: wallBallReps,
        farmerCarryTimeSeconds: parseTimeToSeconds(carry) ?? undefined,
        previousHyroxSeconds: previousSeconds ?? undefined,
      },
      context: {
        trainingFrequency: trainingFrequency as HyroxPredictorDraft["context"]["trainingFrequency"],
        primaryBackground: primaryBackground as HyroxPredictorDraft["context"]["primaryBackground"],
        weeklyRunningKm: weeklyRunningKm as HyroxPredictorDraft["context"]["weeklyRunningKm"],
      },
      race: {
        raceDate: raceDate || undefined,
        targetFinishTimeSeconds: parseTimeToSeconds(goalTime) ?? undefined,
      },
    });
    void navigate("/hyrox-predictor/review");
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={2} steps={PREDICTOR_STEPS} />
        <FormPanel className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.eyebrow}>Step 2 of 3</div>
            <h1>Extra inputs</h1>
            <p>Optional HYROX-specific numbers and training context refine the estimate.</p>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Optional HYROX benchmarks</div>
            <div className={styles.row2}>
              <TimeInput label="2k row time" placeholder="7:45" hint="Optional - Concept2 or equivalent" value={row} onChange={(event) => setRow(event.target.value)} />
              <TimeInput label="1k SkiErg time" placeholder="4:10" hint="Optional - Indoors" value={ski} onChange={(event) => setSki(event.target.value)} />
            </div>
            <div className={styles.row2}>
              <NumberField label="Wall balls in 2 min" value={wallBalls} onChange={setWallBalls} hint={`Optional - ${wallBallWeight(draft)}`} error={errors.wallBalls} />
              <TimeInput label="Farmer's carry time (200m course)" placeholder="1:35" hint={`Optional - ${carryWeight(draft)}`} value={carry} onChange={(event) => setCarry(event.target.value)} />
            </div>
            <TimeInput label="Previous HYROX finish time (optional)" placeholder="1:28:30" value={previousHyrox} onChange={(event) => setPreviousHyrox(event.target.value)} error={errors.previousHyrox} />
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Helps refine your prediction</div>
            <OptionCardGroup
              label="Training frequency"
              value={trainingFrequency}
              onChange={setTrainingFrequency}
              options={[
                { value: "2-3", label: "2-3 sessions/week" },
                { value: "4-5", label: "4-5 sessions/week" },
                { value: "6+", label: "6+ sessions/week" },
              ]}
            />
            <OptionCardGroup
              label="Primary sport background"
              value={primaryBackground}
              onChange={setPrimaryBackground}
              options={[
                { value: "endurance", label: "Endurance / Running" },
                { value: "strength", label: "Strength / Powerlifting" },
                { value: "crossfit", label: "CrossFit / Hybrid" },
                { value: "general", label: "General gym fitness" },
              ]}
            />
            <OptionCardGroup
              label="Weekly running volume"
              value={weeklyRunningKm}
              onChange={setWeeklyRunningKm}
              options={[
                { value: "<15", label: "Less than 15 km" },
                { value: "15-30", label: "15-30 km" },
                { value: "30-45", label: "30-45 km" },
                { value: "45+", label: "45+ km" },
              ]}
            />
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Race details</div>
            <div className={styles.row2}>
              <label className={styles.numberField}>
                <span className={styles.dateLabel}>Target race date</span>
                <input className={styles.dateInput} type="date" value={raceDate} onChange={(event) => setRaceDate(event.target.value)} />
              </label>
              <TimeInput label="Goal time (optional)" placeholder="1:20:00" value={goalTime} onChange={(event) => setGoalTime(event.target.value)} />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => void navigate("/hyrox-predictor")}>Back</button>
            <PrimaryButton type="button" onClick={handleNext}>Next</PrimaryButton>
          </div>
        </FormPanel>
      </div>
    </Shell>
  );
}

function NumberField({ label, value, onChange, hint, error }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  error?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className={styles.numberField}>
      <label htmlFor={id}>{label} <span className={styles.optional}>(Optional)</span></label>
      <input id={id} type="number" min={1} max={200} value={value} onChange={(event) => onChange(event.target.value)} />
      {!error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
