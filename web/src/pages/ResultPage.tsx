import { useLocation, Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import type { HyroxAnalysisResponse } from "../types";
import styles from "./ResultPage.module.css";

interface LocationState {
  response?: HyroxAnalysisResponse;
}

export function ResultPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const response = state?.response;

  if (!response) {
    return (
      <Shell>
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No result found.{" "}
            <Link to="/hyrox-calculator">Analyse a new result →</Link>
          </p>
        </div>
      </Shell>
    );
  }

  const summary = response.browserSummary ?? {};
  const heroInsight = summary.heroInsight;
  const timePotential = summary.timePotential;
  const biggestStrength = summary.biggestStrength;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.badge}>✓ Analysis Complete</div>

        <h1 className={styles.headline} data-testid="result-headline">
          {heroInsight?.label
            ? `Your biggest limiter: ${heroInsight.label}`
            : "Your Analysis Is Ready"}
        </h1>

        <p className={styles.subline}>
          {heroInsight?.timeGapFormatted
            ? `We identified ${heroInsight.timeGapFormatted} of potential time gain from your top opportunity.`
            : "Your personalised performance report has been generated."}
        </p>

        <div className={styles.emailNote} data-testid="email-confirmation">
          <span className={styles.emailIcon}>📧</span>
          <span>
            Your full analysis has been sent to{" "}
            <strong>{response.reportSentTo}</strong>. Check your inbox —
            sometimes it lands in spam.
          </span>
        </div>

        <div className={styles.metricsGrid}>
          {heroInsight?.label && (
            <MetricCard
              title="Biggest Limiter"
              value={heroInsight.label}
              sub={
                heroInsight.timeGapFormatted
                  ? `${heroInsight.timeGapFormatted} to gain`
                  : undefined
              }
              accent="red"
            />
          )}
          {(summary.overallPercentile != null ||
            summary.benchmarkGroupLabel) && (
            <MetricCard
              title="Overall Benchmark"
              value={
                summary.overallPercentile != null
                  ? `Top ${100 - summary.overallPercentile}%`
                  : (summary.benchmarkGroupLabel ?? "—")
              }
              sub="in your age group &amp; division"
              accent="cyan"
            />
          )}
          {biggestStrength?.label && (
            <MetricCard
              title="Biggest Strength"
              value={biggestStrength.label}
              sub={
                biggestStrength.percentile != null
                  ? `Top ${100 - biggestStrength.percentile}%`
                  : undefined
              }
              accent="green"
            />
          )}
          {timePotential?.projectedGainFormatted && (
            <MetricCard
              title="Time Potential"
              value={timePotential.projectedGainFormatted}
              sub={
                timePotential.newProjectedTimeFormatted
                  ? `→ ${timePotential.newProjectedTimeFormatted} projected`
                  : "projected gain"
              }
              accent="cyan"
            />
          )}
        </div>

        {summary.dataQualityNote && (
          <div className={styles.dataNote}>ℹ {summary.dataQualityNote}</div>
        )}

        <div className={styles.actions}>
          <Link to="/hyrox-calculator">
            <PrimaryButton type="button">Analyse Another Result →</PrimaryButton>
          </Link>
        </div>
      </div>
    </Shell>
  );
}
