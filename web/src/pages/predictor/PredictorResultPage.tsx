import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ConfidenceMeter } from "../../components/ConfidenceMeter";
import { FormPanel } from "../../components/FormPanel";
import { LimiterBar } from "../../components/LimiterBar";
import { MetricCard } from "../../components/MetricCard";
import { PredictionBreakdownTable } from "../../components/PredictionBreakdownTable";
import { SecondaryButton } from "../../components/SecondaryButton";
import { Shell } from "../../components/Shell";
import type { HyroxPredictionResponse, PredictedSegment } from "../../types";
import { trackEvent } from "../../utils/api";
import { clearPredictorDraft } from "../../utils/predictorStorage";
import { formatSeconds } from "../../utils/time";
import styles from "./PredictorPages.module.css";

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PredictorResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prediction = (location.state as { prediction?: HyroxPredictionResponse } | null)?.prediction;

  if (!prediction) {
    return <Navigate to="/hyrox-predictor" replace />;
  }

  const segmentTotal = prediction.segments.reduce((sum, segment) => sum + segment.predictedSeconds, 0);
  const roxzoneSeconds = Math.max(0, prediction.predictedFinishSeconds - segmentTotal);
  const modeClass = prediction.predictionMode === "best" ? styles.modeBest : prediction.predictionMode === "better" ? styles.modeBetter : styles.modeMinimum;

  function handleNewPrediction() {
    clearPredictorDraft();
    void navigate("/hyrox-predictor");
  }

  return (
    <Shell>
      <div className={styles.resultPage}>
        <FormPanel className={styles.resultHero}>
          <div className={styles.eyebrow}>Prediction ready</div>
          <h1>Your HYROX Prediction</h1>
          <div className={styles.bigTime}>{prediction.predictedFinishFormatted}</div>
          <p className={styles.muted}>Likely range: {prediction.rangeLowFormatted} - {prediction.rangeHighFormatted}</p>
          <ConfidenceMeter score={prediction.confidenceScore} label={prediction.confidenceLabel} />
          <span className={[styles.modeBadge, modeClass].join(" ")}>{capitalise(prediction.predictionMode)} prediction</span>
        </FormPanel>

        <div className={styles.metricGrid}>
          <MetricCard title="Predicted time" value={prediction.predictedFinishFormatted} sub="Estimated finish" accent="cyan" />
          <MetricCard title="Confidence" value={`${Math.round(prediction.confidenceScore * 100)}%`} sub={capitalise(prediction.confidenceLabel)} accent={prediction.confidenceScore >= 0.65 ? "green" : "default"} />
          <MetricCard title="RoxZone" value={formatSeconds(roxzoneSeconds, "HH:MM:SS")} sub="Included in total" />
        </div>

        <div className={styles.resultGrid}>
          <div className={styles.resultColumn}>
            <FormPanel className={styles.panel}>
              <div className={styles.sectionTitle}>Your biggest limiters</div>
              {prediction.topLimiters.length === 0 ? (
                <p className={styles.muted}>No significant limiters identified - great all-round athlete!</p>
              ) : (
                prediction.topLimiters.slice(0, 3).map((segment, index) => (
                  <LimiterBar
                    key={segment.segmentKey}
                    rank={index + 1}
                    title={segment.label}
                    impact={impactFor(segment)}
                    why={`${Math.round(segment.limiterScore * 100)}% slower than average`}
                  />
                ))
              )}
            </FormPanel>

            <FormPanel className={styles.panel}>
              <div className={styles.sectionTitle}>Biggest time savings</div>
              <div className={styles.stack}>
                {prediction.topOpportunities.slice(0, 3).map((segment) => (
                  <OpportunityRow key={segment.segmentKey} segment={segment} />
                ))}
              </div>
            </FormPanel>
          </div>

          <FormPanel className={styles.panel}>
            <div className={styles.sectionTitle}>Predicted split breakdown</div>
            <PredictionBreakdownTable segments={prediction.segments} totalSeconds={prediction.predictedFinishSeconds} roxzoneSeconds={roxzoneSeconds} />
          </FormPanel>

          <div className={styles.resultColumn}>
            {prediction.targetComparison && (
              <FormPanel className={styles.panel}>
                <div className={styles.sectionTitle}>Target comparison</div>
                <SummaryLine label="Your goal" value={prediction.targetComparison.targetFormatted} />
                <SummaryLine label="Predicted" value={prediction.predictedFinishFormatted} />
                <p className={prediction.targetComparison.gapSeconds >= 0 ? styles.goodCopy : styles.warnCopy}>
                  {prediction.targetComparison.gapSeconds >= 0
                    ? `You're predicted to beat your goal by ${formatSeconds(Math.abs(prediction.targetComparison.gapSeconds))}.`
                    : `${formatSeconds(Math.abs(prediction.targetComparison.gapSeconds))} behind your goal - focus on your top limiters.`}
                </p>
              </FormPanel>
            )}

            <FormPanel className={styles.panel}>
              <div className={styles.sectionTitle}>How we calculated this</div>
              <ul className={styles.assumptionList}>
                {prediction.keyAssumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </FormPanel>

            <FormPanel className={styles.panel}>
              <div className={styles.sectionTitle}>What to do next</div>
              <p className={styles.muted}>{nextStepCopy(prediction.topLimiters[0])}</p>
              <p className={styles.note}>Return after race day with your official result.</p>
            </FormPanel>
          </div>
        </div>

        <div className={styles.resultActions}>
          <SecondaryButton type="button" onClick={handleNewPrediction}>Get another prediction</SecondaryButton>
          <SecondaryButton type="button" onClick={() => void navigate("/hyrox-calculator")}>Analyse an existing result</SecondaryButton>
        </div>
        <FormPanel className={styles.nextStepPanel}>
          <h3 className={styles.nextStepHeading}>Ready to go deeper?</h3>
          <p className={styles.nextStepBody}>
            Get a full benchmarked analysis after your race.
          </p>
          <Link
            to="/hyrox-calculator"
            className={styles.nextStepLink}
            onClick={() => trackEvent("predictor_result_analyse_clicked", { source: "predictor_result" })}
          >
            Analyse my next result -&gt;
          </Link>
        </FormPanel>
      </div>
    </Shell>
  );
}

function impactFor(segment: PredictedSegment): "low" | "medium" | "high" {
  if (segment.limiterScore > 0.2) return "high";
  if (segment.limiterScore > 0.1) return "medium";
  return "low";
}

function OpportunityRow({ segment }: { segment: PredictedSegment }) {
  return (
    <div className={styles.opportunityRow}>
      <strong>{segment.label}</strong>
      <span>Save ~{formatSeconds(segment.opportunityGainSeconds ?? 0)} by reaching average</span>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function nextStepCopy(topLimiter?: PredictedSegment): string {
  if (!topLimiter) return "Your estimate looks balanced. Keep training across running, stations, and transitions until race day.";
  if (topLimiter.type === "run") {
    return "Your biggest limiter is running. Prioritise controlled aerobic volume and compromised run intervals after station work.";
  }
  return `Your biggest limiter is ${topLimiter.label}. Add race-weight station practice under fatigue and keep transitions crisp.`;
}
