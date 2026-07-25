import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormPanel } from "../../components/FormPanel";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { Shell } from "../../components/Shell";
import { SideStepper } from "../../components/SideStepper";
import { PREDICTOR_STEPS } from "../../data/predictorSteps";
import type { HyroxPredictionRequest, HyroxPredictorDraft } from "../../types";
import { RateLimitError, submitHyroxPrediction, ValidationError } from "../../utils/api";
import { clearPredictorDraft, loadPredictorDraft, savePredictorDraft } from "../../utils/predictorStorage";
import { formatSeconds } from "../../utils/time";
import { cmToFeetInches, kgToLb } from "../../utils/unitConversion";
import styles from "./PredictorPages.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function title(value?: string): string {
  if (!value) return "Not supplied";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
}

function formatMaybe(seconds?: number): string {
  return seconds ? formatSeconds(seconds, "HH:MM:SS") : "Not supplied";
}

function predictionMode(draft: HyroxPredictorDraft): "Minimum" | "Better" | "Best" {
  const b = draft.benchmarks;
  const extras = [b.run10kSeconds, b.skiErg1kSeconds || b.rowErg2kSeconds, b.wallBallRepsIn2Min, b.farmerCarryTimeSeconds].filter(Boolean).length;
  if (extras >= 2 && b.previousHyroxSeconds) return "Best";
  if (extras >= 2) return "Better";
  return "Minimum";
}

function compact(values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" - ") || "Not supplied";
}

function formatWeight(kg: number, unit?: "kg" | "lb"): string {
  return unit === "lb" ? `${Math.round(kgToLb(kg))} lb` : `${Math.round(kg)} kg`;
}

function formatRepMax(kg: number, reps: number | undefined, unit?: "kg" | "lb"): string {
  return `${formatWeight(kg, unit)} (${reps ?? 3}RM)`;
}

function formatHeight(cm: number, unit?: "cm" | "ftin"): string {
  if (unit === "ftin") {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function PredictorReviewPage() {
  const navigate = useNavigate();
  const draft = loadPredictorDraft();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(draft.athlete.email ?? "");
  const [marketingConsent, setMarketingConsent] = useState(draft.marketingConsent);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Array<{ field: string; message: string }>>([]);
  const emailIsValid = EMAIL_RE.test(email.trim());

  async function handleSubmit() {
    if (!emailIsValid) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (honeypotRef.current?.value) return;
    setEmailError("");
    setSubmitError("");
    setValidationErrors([]);
    setLoading(true);

    const payload: HyroxPredictionRequest = {
      athlete: {
        name: draft.athlete.name,
        email: email.trim(),
        sex: draft.athlete.sex,
        ageGroup: draft.athlete.ageGroup,
        division: draft.athlete.division,
      },
      benchmarks: draft.benchmarks,
      context: draft.context,
      race: draft.race,
      marketingConsent,
      website: "",
    };

    try {
      savePredictorDraft({ athlete: { ...draft.athlete, email: email.trim() }, marketingConsent });
      const response = await submitHyroxPrediction(payload);
      clearPredictorDraft();
      void navigate("/hyrox-predictor/result", { state: { prediction: response } });
    } catch (err) {
      if (err instanceof ValidationError) {
        setValidationErrors(err.errors);
      } else if (err instanceof RateLimitError) {
        setSubmitError("Too many requests, please wait a moment.");
      } else {
        setSubmitError("We couldn't generate your prediction just now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={3} steps={PREDICTOR_STEPS} />
        <div className={styles.reviewLayout}>
          <FormPanel className={styles.panel}>
            <div className={styles.sectionTitle}>Review inputs</div>
            <EditRow title="Athlete" value={compact([title(draft.athlete.sex), draft.athlete.ageGroup, title(draft.athlete.division)])} onEdit={() => void navigate("/hyrox-predictor")} />
            <EditRow title="Core benchmarks" value={compact([
              `5k ${formatMaybe(draft.benchmarks.run5kSeconds)}`,
              draft.benchmarks.backSquat3RM ? `Squat ${formatRepMax(draft.benchmarks.backSquat3RM, draft.benchmarks.backSquatReps, draft.athlete.weightUnit)}` : undefined,
              draft.benchmarks.deadlift3RM ? `Deadlift ${formatRepMax(draft.benchmarks.deadlift3RM, draft.benchmarks.deadliftReps, draft.athlete.weightUnit)}` : undefined,
              draft.benchmarks.bodyweightKg ? `Bodyweight ${formatWeight(draft.benchmarks.bodyweightKg, draft.athlete.weightUnit)}` : undefined,
              draft.benchmarks.heightCm ? `Height ${formatHeight(draft.benchmarks.heightCm, draft.athlete.heightUnit)}` : undefined,
              draft.benchmarks.run10kSeconds ? `10k ${formatMaybe(draft.benchmarks.run10kSeconds)}` : undefined,
            ])} onEdit={() => void navigate("/hyrox-predictor")} />
            <EditRow title="Extra benchmarks" value={compact([
              draft.benchmarks.rowErg2kSeconds ? `Row ${formatMaybe(draft.benchmarks.rowErg2kSeconds)}` : undefined,
              draft.benchmarks.skiErg1kSeconds ? `Ski ${formatMaybe(draft.benchmarks.skiErg1kSeconds)}` : undefined,
              draft.benchmarks.wallBallRepsIn2Min ? `${draft.benchmarks.wallBallRepsIn2Min} wall balls` : undefined,
              draft.benchmarks.farmerCarryTimeSeconds ? `Carry ${formatMaybe(draft.benchmarks.farmerCarryTimeSeconds)}` : undefined,
              draft.benchmarks.previousHyroxSeconds ? `Previous ${formatMaybe(draft.benchmarks.previousHyroxSeconds)}` : undefined,
            ])} onEdit={() => void navigate("/hyrox-predictor/benchmarks")} />
            <EditRow title="Training context" value={compact([draft.context.trainingFrequency, draft.context.primaryBackground, draft.context.weeklyRunningKm])} onEdit={() => void navigate("/hyrox-predictor/benchmarks")} />
          </FormPanel>

          <FormPanel className={styles.panel}>
            <span className={styles.badge}>{predictionMode(draft)} prediction</span>
            <div className={styles.stack} style={{ marginTop: 16 }}>
              {validationErrors.length > 0 && (
                <div className={styles.errorBox}>
                  <strong>Please fix the following:</strong>
                  <ul>{validationErrors.map((err) => <li key={`${err.field}-${err.message}`}>{err.message}</li>)}</ul>
                </div>
              )}
              {submitError && <div className={styles.errorBox}>{submitError}</div>}
              <label className={styles.checkRow}>
                <span className={styles.emailLabel}>Email address</span>
                <input className={styles.emailInput} type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(""); }} placeholder="you@example.com" />
                {emailError && <span className={styles.error}>{emailError}</span>}
              </label>
              <label className={`${styles.checkRow} ${styles.checkbox}`}>
                <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
                <span>Send me HYROX training updates and related Forma emails.</span>
              </label>
              <PrivacyNotice text="Your inputs are used to generate this prediction. You can unsubscribe from emails at any time." />
              <PrimaryButton type="button" fullWidth loading={loading} disabled={!emailIsValid || loading} onClick={() => void handleSubmit()}>
                Get prediction
              </PrimaryButton>
            </div>
          </FormPanel>

          <FormPanel className={styles.sidePanel}>
            <div className={styles.sectionTitle}>What you'll get</div>
            <ul className={styles.muted}>
              <li>Predicted finish time</li>
              <li>Likely time range</li>
              <li>Confidence score</li>
              <li>Split breakdown</li>
              <li>Top limiters</li>
              <li>Training opportunities</li>
            </ul>
          </FormPanel>
        </div>
        <input ref={honeypotRef} className={styles.honeypot} name="website" type="text" tabIndex={-1} aria-hidden="true" />
      </div>
    </Shell>
  );
}

function EditRow({ title, value, onEdit }: { title: string; value: string; onEdit: () => void }) {
  return (
    <div className={styles.editRow}>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
      <button type="button" onClick={onEdit}>Edit</button>
    </div>
  );
}
