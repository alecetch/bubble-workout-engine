import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SideStepper } from "../components/SideStepper";
import { loadDraft, clearDraft } from "../utils/storage";
import { formatSeconds } from "../utils/time";
import {
  submitHyroxAnalysis,
  ValidationError,
  RateLimitError,
} from "../utils/api";
import { trackEvent } from "../utils/api";
import type { HyroxAnalysisRequest } from "../types";
import styles from "./ReviewPage.module.css";

export function ReviewPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Array<{ field: string; message: string }>
  >([]);

  if (!draft?.athlete || !draft?.race) {
    return (
      <Shell>
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No race data found. Please start from{" "}
            <a href="/hyrox-calculator">the beginning</a>.
          </p>
        </div>
      </Shell>
    );
  }

  const { athlete, race, splits = [], athleteContext, marketingConsent = false } = draft;

  const splitTotal = splits.reduce((sum, s) => sum + (s.timeSeconds ?? 0), 0);
  const roxzone = race.finishTimeSeconds - splitTotal;
  const isOver = splitTotal > race.finishTimeSeconds + 5;
  const missingSplits = 16 - splits.filter((s) => s.timeSeconds > 0).length;

  async function handleSubmit() {
    // Honeypot check — silently discard if populated
    if (honeypotRef.current?.value) return;

    setSubmitError(null);
    setValidationErrors([]);
    setLoading(true);

    const payload: HyroxAnalysisRequest = {
      athlete: {
        name: athlete.name,
        email: athlete.email,
        sex: athlete.gender,
        ageOnRaceDay: athlete.ageOnRaceDay,
      },
      race: {
        raceName: race.raceName,
        raceDate: race.raceDate,
        division: race.division,
        finishTimeSeconds: race.finishTimeSeconds,
      },
      splits,
      athleteContext,
      marketingConsent,
    };

    try {
      const response = await submitHyroxAnalysis(payload);
      clearDraft();
      trackEvent("analysis_submitted");
      void navigate("/hyrox-calculator/result", { state: { response } });
    } catch (err) {
      if (err instanceof ValidationError) {
        setValidationErrors(err.errors);
      } else if (err instanceof RateLimitError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={4} />

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
          Review &amp; Submit
        </h1>

        {isOver && (
          <div className={styles.warningBanner}>
            ⚠ Split total ({formatSeconds(splitTotal)}) exceeds finish time (
            {formatSeconds(race.finishTimeSeconds)}). Please go back and correct
            your splits.
          </div>
        )}
        {missingSplits > 0 && !isOver && (
          <div className={styles.infoNote}>
            {missingSplits} split{missingSplits > 1 ? "s" : ""} missing — your
            analysis will be based on partial data.
          </div>
        )}

        <div className={styles.layout}>
          <FormPanel>
            <div className={styles.sectionTitle}>Race Summary</div>
            <div className={styles.reviewRows}>
              <ReviewRow
                label="Athlete"
                value={athlete.name ?? athlete.email}
              />
              <ReviewRow label="Email" value={athlete.email} />
              <ReviewRow label="Division" value={race.division.toUpperCase()} />
              <ReviewRow
                label="Finish Time"
                value={formatSeconds(race.finishTimeSeconds, "HH:MM:SS")}
              />
              {race.raceName && (
                <ReviewRow label="Race" value={race.raceName} />
              )}
              {race.raceDate && (
                <ReviewRow label="Date" value={race.raceDate} />
              )}
              <ReviewRow
                label="Splits Entered"
                value={`${splits.filter((s) => s.timeSeconds > 0).length} / 16`}
              />
              <ReviewRow
                label="Splits Total"
                value={splitTotal > 0 ? formatSeconds(splitTotal) : "—"}
              />
              <ReviewRow
                label="Roxzone (est.)"
                value={
                  roxzone > 0 && !isOver ? formatSeconds(roxzone) : "—"
                }
              />
            </div>
          </FormPanel>

          {athleteContext && (
            <FormPanel>
              <div className={styles.sectionTitle}>Training Context</div>
              <div className={styles.reviewRows}>
                {athleteContext.trainingAge && (
                  <ReviewRow
                    label="Training Age"
                    value={athleteContext.trainingAge.replace(/_/g, " ")}
                  />
                )}
                {athleteContext.primaryBackground && (
                  <ReviewRow
                    label="Background"
                    value={athleteContext.primaryBackground.replace(/_/g, " ")}
                  />
                )}
                {athleteContext.weeklyRunningVolume && (
                  <ReviewRow
                    label="Weekly Running"
                    value={athleteContext.weeklyRunningVolume.replace(/_/g, " ")}
                  />
                )}
                {athleteContext.weeklyStrengthSessions && (
                  <ReviewRow
                    label="Strength Sessions"
                    value={athleteContext.weeklyStrengthSessions.replace(/_/g, " ")}
                  />
                )}
                {athleteContext.targetFinishTimeSeconds && (
                  <ReviewRow
                    label="Target Time"
                    value={formatSeconds(
                      athleteContext.targetFinishTimeSeconds,
                      "HH:MM:SS",
                    )}
                  />
                )}
              </div>
            </FormPanel>
          )}
        </div>

        {/* Honeypot field — hidden from real users */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          aria-hidden="true"
          className={styles.honeypot}
          ref={honeypotRef}
          autoComplete="off"
        />

        <FormPanel className={styles.ctaSection}>
          {validationErrors.length > 0 && (
            <div className={styles.errorMsg}>
              <strong>Please fix the following:</strong>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {validationErrors.map((e) => (
                  <li key={e.field}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {submitError && (
            <div className={styles.errorMsg}>{submitError}</div>
          )}

          <div className={styles.submitArea}>
            <div className={styles.backRow}>
              <SecondaryButton
                type="button"
                onClick={() => void navigate("/hyrox-calculator/context")}
                disabled={loading}
              >
                ← Back
              </SecondaryButton>
            </div>
            <PrimaryButton
              type="button"
              fullWidth
              loading={loading}
              disabled={loading}
              onClick={() => void handleSubmit()}
            >
              Send My Performance Report
            </PrimaryButton>
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Your report will be sent to {athlete.email}
            </p>
          </div>
        </FormPanel>
      </div>
    </Shell>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}
