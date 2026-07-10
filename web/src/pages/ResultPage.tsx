import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SharePackCard } from "../components/SharePackCard";
import type { HyroxAnalysisResponse } from "../types";
import { trackEvent } from "../utils/api";
import styles from "./ResultPage.module.css";

interface LocationState {
  response?: HyroxAnalysisResponse;
}

function profileTypeLabel(profileType: string | null | undefined): string {
  const map: Record<string, string> = {
    runner_dominant: "Runner dominant",
    strength_dominant: "Station dominant",
    balanced_hybrid: "Balanced hybrid",
    transition_limited: "Transition limited",
  };
  return profileType && map[profileType] ? map[profileType] : "Mixed profile";
}

export function ResultPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const response = state?.response;
  const submissionId = response?.submissionId;
  const responseMode = response?.calculatorMode ?? response?.browserSummary?.calculatorMode;
  const [selectedComparisonId, setSelectedComparisonId] = useState<string>("global");

  useEffect(() => {
    if (submissionId && responseMode !== "target") {
      trackEvent("analysis_completed_next_step_viewed", {
        submissionId,
        calculatorMode: responseMode,
        source: "post_analysis",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const calculatorMode = response.calculatorMode ?? summary.calculatorMode ?? "target";
  const comparisonOptions = summary.comparisonOptions?.options ?? [];
  const selectedComparison =
    comparisonOptions.find((option) => option.id === selectedComparisonId)
    ?? comparisonOptions.find((option) => option.id === summary.comparisonOptions?.defaultId)
    ?? comparisonOptions[0]
    ?? null;
  const benchmarkValue = selectedComparison
    ? `Top ${selectedComparison.topPercent}%`
    : summary.overallPercentile != null
      ? `Top ${100 - summary.overallPercentile}%`
      : null;
  const benchmarkLabel = selectedComparison?.label ?? summary.benchmarkGroupLabel ?? "your benchmark group";
  const hasComparisonSwitcher = calculatorMode === "analyse" && comparisonOptions.length > 1;
  const heroInsight = summary.heroInsight;
  const timePotential = summary.timePotential;
  const biggestStrength = summary.biggestStrength;
  const targetUrl = submissionId
    ? `/hyrox-calculator/race-details?mode=target&source=analysis_complete&submissionId=${encodeURIComponent(submissionId)}`
    : null;
  const showTargetCta = Boolean(targetUrl && responseMode !== "target");

  function handleTargetClick() {
    trackEvent("post_analysis_target_clicked", {
      submissionId,
      source: "analysis_complete",
      journeyVariant: "target-post-analysis",
    });
  }

  function handleAnalyseAnotherClick() {
    trackEvent("post_analysis_analyse_another_clicked", {
      submissionId,
      source: "analysis_complete",
    });
  }

  function handleHomeClick() {
    trackEvent("post_analysis_home_clicked", { submissionId });
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.badge}>✓ Analysis Complete</div>

        <h1 className={styles.headline} data-testid="result-headline">
          {calculatorMode === "analyse"
            ? summary.athleteArchetype?.label
              ? `Your race profile: ${summary.athleteArchetype.label}`
              : "Your Analysis Is Ready"
            : heroInsight?.label
              ? `Your biggest limiter: ${heroInsight.label}`
              : "Your Analysis Is Ready"}
        </h1>

        <p className={styles.subline}>
          {calculatorMode === "analyse"
            ? benchmarkValue
              ? `You finished in the ${benchmarkValue.toLowerCase()} of ${benchmarkLabel}.`
              : "Your personalised performance report has been generated."
            : heroInsight?.timeGapFormatted
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

        {hasComparisonSwitcher && (
          <section className={styles.comparisonPanel} aria-labelledby="comparison-heading">
            <div className={styles.comparisonHeader}>
              <h2 id="comparison-heading">Benchmark view</h2>
              <p>Switch the headline benchmark without changing the report underneath.</p>
            </div>
            <div className={styles.comparisonButtons} role="group" aria-label="Benchmark comparison view">
              {comparisonOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.comparisonButton} ${selectedComparison?.id === option.id ? styles.comparisonButtonActive : ""}`}
                  onClick={() => {
                    setSelectedComparisonId(option.id);
                    trackEvent("hyrox_benchmark_view_changed", {
                      submissionId,
                      comparisonId: option.id,
                    });
                  }}
                >
                  <span>{option.id === "global" ? "Global population" : option.id === "regional" ? "Regional population" : "Age group"}</span>
                  <strong>Top {option.topPercent}%</strong>
                  <small>{option.label} · {option.sampleSize.toLocaleString()} records</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className={styles.metricsGrid}>
          {summary.athleteArchetype?.label && (
            <MetricCard
              title="Athlete Archetype"
              value={summary.athleteArchetype.label}
              sub="based on your split profile"
              accent="amber"
            />
          )}
          {calculatorMode === "analyse" && (
            <>
              {(benchmarkValue || summary.benchmarkGroupLabel) && (
                <MetricCard
                  title="Benchmark Position"
                  value={benchmarkValue ?? (summary.benchmarkGroupLabel ?? "-")}
                  sub={selectedComparison ? `${selectedComparison.label} · ${selectedComparison.sampleSize.toLocaleString()} records` : benchmarkLabel}
                  accent="cyan"
                />
              )}
              {summary.workRunBalance?.profileType && (
                <MetricCard
                  title="Run vs Station"
                  value={profileTypeLabel(summary.workRunBalance.profileType)}
                  sub={
                    summary.workRunBalance.runSharePct != null && summary.workRunBalance.workSharePct != null
                      ? `${summary.workRunBalance.runSharePct}% running - ${summary.workRunBalance.workSharePct}% stations`
                      : "run / station split"
                  }
                  accent="blue"
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
            </>
          )}
          {calculatorMode !== "analyse" && (
            <>
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
            </>
          )}
        </div>

        {summary.dataQualityNote && (
          <div className={styles.dataNote}>ℹ {summary.dataQualityNote}</div>
        )}

        {response.submissionId && (
          <SharePackCard submissionId={response.submissionId} prefillEmail={response.reportSentTo} />
        )}

        {submissionId && (
          <section className={styles.nextStepPanel} aria-labelledby="next-step-heading">
            <div className={styles.nextStepHeader}>
              <h2 id="next-step-heading">Your analysis is ready.</h2>
              {showTargetCta && (
                <p>
                  Use this result as your baseline and see what needs to change to hit your next HYROX target.
                </p>
              )}
            </div>

            <div className={styles.nextStepGrid}>
              {targetUrl && showTargetCta && (
                <article className={`${styles.nextStepCard} ${styles.nextStepPrimary}`}>
                  <div>
                    <h3>Hit a target time</h3>
                    <p>
                      We&apos;ll carry your race details, splits and context forward so you don&apos;t need to enter them again.
                    </p>
                  </div>
                  <Link to={targetUrl} onClick={handleTargetClick}>
                    <PrimaryButton type="button">Hit a target time using this race</PrimaryButton>
                  </Link>
                </article>
              )}

              <article className={`${styles.nextStepCard} ${showTargetCta ? "" : styles.nextStepPrimary}`}>
                <div>
                  <h3>Analyse another race</h3>
                  <p>Upload a different HYROX result or compare another event.</p>
                </div>
                <Link to="/hyrox-calculator/race-details" onClick={handleAnalyseAnotherClick}>
                  {showTargetCta ? (
                    <SecondaryButton type="button">Analyse another race</SecondaryButton>
                  ) : (
                    <PrimaryButton type="button">Analyse another race</PrimaryButton>
                  )}
                </Link>
              </article>
            </div>

            <Link to="/hyrox-calculator" className={styles.tertiaryLink} onClick={handleHomeClick}>
              Back to calculator home
            </Link>
          </section>
        )}
      </div>
    </Shell>
  );
}
