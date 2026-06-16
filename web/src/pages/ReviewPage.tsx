import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SideStepper } from "../components/SideStepper";
import { loadDraft, clearDraft, saveDraft } from "../utils/storage";
import { formatSeconds } from "../utils/time";
import {
  submitHyroxAnalysis,
  ValidationError,
  RateLimitError,
} from "../utils/api";
import { trackEvent } from "../utils/api";
import type { HyroxAnalysisRequest } from "../types";
import styles from "./ReviewPage.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatContextValue(raw: string): string {
  return toTitleCase(raw.replace(/(\d+)_(\d+)/g, "$1-$2").replace(/_/g, " "));
}

export function ReviewPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [email, setEmail] = useState(draft?.athlete?.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
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

  const { athlete, race, splits = [], penalties = [], athleteContext, marketingConsent = false } = draft;

  const splitTotal = splits.reduce((sum, s) => sum + (s.timeSeconds ?? 0), 0);
  const roxzone = race.finishTimeSeconds - splitTotal;
  const isOver = splitTotal > race.finishTimeSeconds + 5;
  const missingSplits = 16 - splits.filter((s) => s.timeSeconds > 0).length;

  async function handleSubmit() {
    if (!email || !EMAIL_RE.test(email.trim())) {
      setEmailError("A valid email address is required.");
      setLoading(false);
      return;
    }
    setEmailError(null);
    // Honeypot check — silently discard if populated
    if (honeypotRef.current?.value) return;

    setSubmitError(null);
    setValidationErrors([]);
    setLoading(true);
    saveDraft({ athlete: { ...athlete, email: email.trim() } });

    const payload: HyroxAnalysisRequest = {
      athlete: {
        name: athlete.name,
        email: email.trim(),
        sex: athlete.gender,
        ageOnRaceDay: athlete.ageOnRaceDay,
        ageGroup: athlete.ageGroup,
      },
      race: {
        raceName: race.raceName,
        raceDate: race.raceDate,
        division: race.division,
        finishTimeSeconds: race.finishTimeSeconds,
      },
      splits,
      penalties,
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
                value={athlete.name ? toTitleCase(athlete.name) : "Not supplied"}
              />
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
                    value={formatContextValue(athleteContext.trainingAge)}
                  />
                )}
                {athleteContext.primaryBackground && (
                  <ReviewRow
                    label="Background"
                    value={formatContextValue(athleteContext.primaryBackground)}
                  />
                )}
                {athleteContext.weeklyRunningVolume && (
                  <ReviewRow
                    label="Weekly Running"
                    value={formatContextValue(athleteContext.weeklyRunningVolume)}
                  />
                )}
                {athleteContext.weeklyStrengthSessions && (
                  <ReviewRow
                    label="Strength Sessions"
                    value={formatContextValue(athleteContext.weeklyStrengthSessions)}
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Where should we send your analysis? *
            </label>
            <input
              data-testid="email-input"
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-950)",
                color: "var(--text-primary)",
              }}
            />
            {emailError && (
              <div data-testid="email-error" style={{ color: "var(--accent-red)", marginTop: 6, fontSize: 13 }}>
                {emailError}
              </div>
            )}
          </div>

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
              Your report will be sent to {email}
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
