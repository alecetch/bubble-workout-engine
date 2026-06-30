import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { Shell } from "../components/Shell";
import { SideStepper } from "../components/SideStepper";
import type { HyroxAnalysisRequest, HyroxCalculatorDraft } from "../types";
import { RateLimitError, submitHyroxAnalysis, trackEvent, ValidationError } from "../utils/api";
import { clearDraft, loadDraft, saveDraft } from "../utils/storage";
import { formatSeconds } from "../utils/time";
import styles from "./ReviewPage.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatContextValue(raw: string): string {
  return toTitleCase(
    raw
      .replace(/(\d+)_(\d+)/g, "$1-$2")
      .replace(/plus/g, "+")
      .replace(/under/g, "Under")
      .replace(/_/g, " "),
  ).replace(/\bKm\b/g, "km");
}

function formatSignedSeconds(seconds: number): string {
  const sign = seconds >= 0 ? "+" : "-";
  return `${sign}${formatSeconds(Math.abs(seconds))}`;
}

function formatDivision(division: string, gender?: "male" | "female" | "mixed"): string {
  const divisionLabel = division === "pro" ? "Pro" : division === "doubles" ? "Doubles" : division === "relay" ? "Relay" : "Open";
  const genderLabel = gender === "female" ? "Women" : gender === "mixed" ? "Mixed" : "Men";
  return `HYROX ${genderLabel}${divisionLabel === "Open" ? "" : ` ${divisionLabel}`}`;
}

function contextCount(ctx: HyroxCalculatorDraft["athleteContext"]): number {
  return [ctx?.weeklyStrengthSessions, ctx?.weeklyRunningVolume, ctx?.primaryBackground].filter(Boolean).length;
}

export function ReviewPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [email, setEmail] = useState(draft?.athlete?.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{ field: string; message: string }>>([]);

  if (!draft?.athlete || !draft?.race) {
    return (
      <Shell>
        <div className={styles.emptyState}>
          <p>
            No race data found. Please start from <a href="/hyrox-calculator">the beginning</a>.
          </p>
        </div>
      </Shell>
    );
  }

  const { athlete, race, splits = [], penalties = [], raceReplay = [], athleteContext, marketingConsent = false } = draft;
  const completedSplits = splits.filter((s) => s.timeSeconds > 0).length;
  const splitTotal = splits.reduce((sum, s) => sum + (s.timeSeconds ?? 0), 0);
  const estimatedRoxzone = race.finishTimeSeconds - splitTotal;
  const roxzoneVariance = draft.roxzoneTimeSeconds && estimatedRoxzone > 0 ? draft.roxzoneTimeSeconds - estimatedRoxzone : null;
  const isOver = splitTotal > race.finishTimeSeconds + 5;
  const missingSplits = 16 - completedSplits;
  const emailIsValid = EMAIL_RE.test(email.trim());
  const contextRequiredCount = contextCount(athleteContext);
  const raceLabel = formatDivision(race.division, athlete.gender);
  const targetFinishTimeSeconds = athleteContext?.targetFinishTimeSeconds ?? null;
  const targetFinishTimeLabel = targetFinishTimeSeconds ? formatSeconds(targetFinishTimeSeconds) : "Not supplied";
  const benchmarkLabel = athleteContext?.targetFinishTimeSeconds
    ? `${formatSeconds(athleteContext.targetFinishTimeSeconds)} target`
    : `${race.division.toUpperCase()} ${athlete.gender === "female" ? "Women" : "Men"}${athlete.ageGroup ? ` ${athlete.ageGroup}` : ""}`;
  const roxzoneSummary = roxzoneVariance !== null ? `${formatSignedSeconds(roxzoneVariance)} variance` : "Ready";
  const contextSummary = [
    athleteContext?.weeklyStrengthSessions ? formatContextValue(athleteContext.weeklyStrengthSessions) : null,
    athleteContext?.weeklyRunningVolume ? formatContextValue(athleteContext.weeklyRunningVolume) : null,
    athleteContext?.primaryBackground ? formatContextValue(athleteContext.primaryBackground) : null,
  ].filter(Boolean).join(" - ");

  async function handleSubmit() {
    if (!email.trim()) {
      setEmailError("Enter an email address to generate your report.");
      setLoading(false);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      setLoading(false);
      return;
    }
    setEmailError(null);
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
      raceReplay,
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
        setSubmitError("We couldn't generate your report just now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={4} />

        <FormPanel className={styles.introCard}>
          <div className={styles.introCopy}>
            <h1>Review and receive your analysis</h1>
            <p>Check the details below, add your email, and Forma will generate your personalised HYROX performance report.</p>
          </div>
          <div className={styles.chips}>
            <span className={styles.chipCyan}>FINAL STEP</span>
            <span className={styles.chipGreen}>Report preview ready</span>
          </div>
        </FormPanel>

        {isOver && (
          <div className={styles.warningBanner}>
            Split total ({formatSeconds(splitTotal)}) exceeds finish time ({formatSeconds(race.finishTimeSeconds)}). Please edit your splits before submitting.
          </div>
        )}
        {missingSplits > 0 && !isOver && (
          <div className={styles.infoNote}>
            {missingSplits} split{missingSplits > 1 ? "s" : ""} missing - your analysis will be based on partial data.
          </div>
        )}

        <div className={styles.reviewGrid}>
          <div className={styles.leftColumn}>
            <FormPanel className={styles.summaryPanel}>
              <div className={styles.sectionTitle}>ANALYSIS SUMMARY</div>
              <h2 className={styles.cardHeading}>Ready to generate</h2>
              <p className={styles.cardCopy}>Your race data, split check and training context are complete.</p>
              <div className={styles.summaryRows}>
                <SummaryRow label="Race" value={raceLabel} />
                <SummaryRow label="Finish time" value={formatSeconds(race.finishTimeSeconds, "HH:MM:SS")} />
                <SummaryRow label="Target finish time" value={targetFinishTimeLabel} />
                <SummaryRow label="Benchmark" value={benchmarkLabel} />
                <SummaryRow label="Splits" value={`${completedSplits}/16 complete`} />
                <SummaryRow label="RoxZone check" value={roxzoneSummary} />
                <SummaryRow label="Context" value={`${contextRequiredCount} required answers`} />
              </div>
              <div className={styles.completeBlock}>
                <strong>All core data complete</strong>
                <span>You can go back to edit anything before submitting.</span>
              </div>
            </FormPanel>

            <FormPanel className={styles.includePanel}>
              <div className={styles.sectionTitle}>REPORT WILL INCLUDE</div>
              <IncludeItem title="Benchmark position" body="How you compare against the target group." />
              <IncludeItem title="Biggest time gaps" body="Stations, running and RoxZone separated." />
              <IncludeItem title="Strengths to protect" body="Segments where you're already ahead." />
              <IncludeItem title="Training priorities" body="Practical next steps based on race and context." />
              <IncludeItem title="Email + shareable view" body="A report you can save and revisit." />
            </FormPanel>
          </div>

          <div className={styles.centerColumn}>
            <FormPanel className={styles.emailCard}>
              <div className={styles.sectionTitle}>WHERE SHOULD WE SEND IT?</div>
              <h2 className={styles.emailHeading}>Get your HYROX analysis</h2>
              <p className={styles.cardCopy}>Enter your email to generate the report. We'll use it to send this analysis and related Forma updates.</p>

              {validationErrors.length > 0 && (
                <div className={styles.errorMsg}>
                  <strong>Please fix the following:</strong>
                  <ul>
                    {validationErrors.map((e) => (
                      <li key={e.field}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {submitError && <div className={styles.errorMsg}>{submitError}</div>}

              <label className={styles.emailLabel} htmlFor="review-email">
                EMAIL ADDRESS
              </label>
              <input
                id="review-email"
                data-testid="email-input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                className={`${styles.emailInput} ${emailError ? styles.emailInputError : ""}`}
              />
              {emailError && (
                <div data-testid="email-error" className={styles.emailError}>
                  {emailError}
                </div>
              )}

              <PrimaryButton type="button" fullWidth loading={loading} disabled={loading} onClick={() => void handleSubmit()}>
                {loading ? "Generating your report..." : "Generate My Report"}
              </PrimaryButton>
              <p className={styles.timingNote}>Takes around 10 seconds.</p>

              <div className={styles.privacyNote}>
                <strong>Privacy note</strong>
                <span>No spam. Unsubscribe any time. Your result is used to generate this report.</span>
              </div>
            </FormPanel>

            <FormPanel className={styles.reviewPanel}>
              <div className={styles.sectionTitle}>REVIEW BEFORE SUBMITTING</div>
              <EditRow
                title="Race details"
                value={`${raceLabel} · Finish ${formatSeconds(race.finishTimeSeconds)} · Target ${targetFinishTimeLabel}`}
                onEdit={() => void navigate("/hyrox-calculator/race-details")}
              />
              <EditRow
                title="Splits"
                value={`${completedSplits}/16 complete - RoxZone ${roxzoneSummary}`}
                onEdit={() => void navigate("/hyrox-calculator/splits")}
              />
              <EditRow
                title="Context"
                value={contextSummary || "Context not supplied"}
                onEdit={() => void navigate("/hyrox-calculator/context")}
              />
            </FormPanel>
          </div>

          <div className={styles.rightColumn}>
            <FormPanel className={styles.nextPanel}>
              <div className={styles.sectionTitle}>WHAT HAPPENS NEXT</div>
              <p>Forma will generate the report, email it to you, then show the result confirmation screen.</p>
            </FormPanel>

            <FormPanel className={styles.qualityPanel}>
              <div className={styles.sectionTitle}>QUALITY CHECKS</div>
              <QualityRow label="Race data" status="Complete" tone="good" />
              <QualityRow label="Splits" status={missingSplits > 0 ? "Partial" : "Complete"} tone={missingSplits > 0 ? "warn" : "good"} />
              <QualityRow label="RoxZone" status={isOver ? "Review" : "Good"} tone={isOver ? "warn" : "good"} />
              <QualityRow label="Context" status={contextRequiredCount >= 3 ? "Complete" : "Partial"} tone={contextRequiredCount >= 3 ? "good" : "warn"} />
              <QualityRow label="Email" status={emailIsValid ? "Complete" : "Required"} tone={emailIsValid ? "good" : "warn"} />
            </FormPanel>

            <SecondaryButton type="button" onClick={() => void navigate("/hyrox-calculator/context")} disabled={loading}>
              Back to Context
            </SecondaryButton>
          </div>
        </div>

        <input
          type="text"
          name="website"
          tabIndex={-1}
          aria-hidden="true"
          className={styles.honeypot}
          ref={honeypotRef}
          autoComplete="off"
        />

        <div className={styles.mobileStickyCta}>
          <PrimaryButton type="button" fullWidth loading={loading} disabled={loading || !emailIsValid} onClick={() => void handleSubmit()}>
            {loading ? "Generating your report..." : "Generate My Report"}
          </PrimaryButton>
        </div>
      </div>
    </Shell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IncludeItem({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.includeItem}>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function EditRow({ title, value, onEdit }: { title: string; value: string; onEdit: () => void }) {
  return (
    <div className={styles.editRow}>
      <div>
        <strong>{title}</strong>
        <span>{value}</span>
      </div>
      <button type="button" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

function QualityRow({ label, status, tone }: { label: string; status: string; tone: "good" | "warn" }) {
  return (
    <div className={styles.qualityRow}>
      <span>{label}</span>
      <strong className={tone === "good" ? styles.goodStatus : styles.warnStatus}>{status}</strong>
    </div>
  );
}
