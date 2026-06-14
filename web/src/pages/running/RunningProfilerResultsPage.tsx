import { useLocation, Link } from "react-router-dom";
import { Shell } from "../../components/Shell";
import { MetricCard } from "../../components/MetricCard";
import { LimiterBar } from "../../components/LimiterBar";
import { RecommendationCard } from "../../components/RecommendationCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { formatSeconds } from "../../utils/time";
import type { RunningAnalysisResponse } from "../../utils/runningApi";
import styles from "./RunningProfilerResultsPage.module.css";

interface LocationState {
  response?: RunningAnalysisResponse;
  email?: string;
}

export function RunningProfilerResultsPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const response = state?.response;
  const emailUsed = state?.email;

  if (!response) {
    return (
      <Shell>
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No results found.{" "}
            <Link to="/running-profiler">Start a new analysis →</Link>
          </p>
        </div>
      </Shell>
    );
  }

  const { confidence, analysis } = response;
  const translation = analysis.performanceTranslation;

  const confidenceCls = [
    styles.confidence,
    confidence === "high" ? styles.high : confidence === "medium" ? styles.medium : styles.low,
  ].join(" ");

  return (
    <Shell>
      <div className={styles.page}>
        <h1 className={styles.headline} data-testid="results-headline">
          Your Running &amp; Hybrid Performance Profile
        </h1>
        <div className={confidenceCls}>
          Confidence: {confidence.toUpperCase()}
        </div>

        {/* Score grid */}
        <div className={styles.metricsGrid}>
          <MetricCard
            title="Overall Performance"
            value={`${analysis.overallPerformanceScore}/100`}
          />
          <MetricCard
            title="Running Capacity"
            value={`${analysis.runningCapacityScore}/100`}
            accent={analysis.runningCapacityScore >= 65 ? "green" : analysis.runningCapacityScore >= 45 ? "default" : "red"}
          />
          {analysis.strengthPowerScore != null && (
            <MetricCard
              title="Strength & Power"
              value={`${analysis.strengthPowerScore}/100`}
            />
          )}
          {analysis.enduranceDurabilityScore != null && (
            <MetricCard
              title="Endurance Durability"
              value={`${analysis.enduranceDurabilityScore}/100`}
            />
          )}
          {analysis.runningEconomyScore != null && (
            <MetricCard
              title="Running Economy"
              value={`${analysis.runningEconomyScore}/100`}
            />
          )}
          <MetricCard
            title="Balance Score"
            value={`${analysis.balanceScore}/100`}
            accent={analysis.balanceScore >= 60 ? "green" : "red"}
          />
        </div>

        {/* Key Insight */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Key Insight</div>
          <div className={styles.keyInsight} data-testid="key-insight">
            {analysis.keyInsight}
          </div>
        </div>

        {/* Limiters */}
        {analysis.limiters.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>What&apos;s Holding You Back</div>
            {analysis.limiters.map((l) => (
              <LimiterBar
                key={l.rank}
                rank={l.rank}
                title={l.title}
                impact={l.impact as "low" | "medium" | "high"}
                why={l.why}
              />
            ))}
          </div>
        )}

        {/* Performance Translation */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Performance Translation</div>
          <div className={styles.translationCard}>
            {translation.projectedHyroxSeconds ? (
              <>
                <div className={styles.translationValue}>
                  Projected HYROX: {formatSeconds(translation.projectedHyroxSeconds, "HH:MM:SS")}
                </div>
                {translation.runningCapacityForGoal && (
                  <div className={styles.translationLabel}>
                    Running capacity for goal:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {translation.runningCapacityForGoal}
                    </strong>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.translationValue} style={{ fontSize: 18 }}>
                {translation.note}
              </div>
            )}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {translation.note}
              {translation.performanceNotes && (
                <div style={{ marginTop: 6, color: "var(--accent-amber)" }}>
                  ℹ {translation.performanceNotes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trade-offs */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Balance &amp; Trade-Offs</div>
          <div className={styles.tradeOffCard}>{analysis.tradeOffOutlook}</div>
        </div>

        {/* Recommendations */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} data-testid="recs-section">
            Top Recommendations
          </div>
          <div className={styles.recsGrid}>
            {analysis.recommendations.map((r) => (
              <RecommendationCard
                key={r.rank}
                rank={r.rank}
                title={r.title}
                impact={r.impact as "low" | "medium" | "high"}
                why={r.why}
                example={r.example}
              />
            ))}
          </div>
        </div>

        {/* Email capture if no email provided */}
        {!emailUsed && (
          <div className={styles.emailCapture} data-testid="email-capture">
            <h2 className={styles.emailCaptureTitle}>Save Your Report</h2>
            <p className={styles.emailCaptureSub}>
              Enter your email to receive a copy of this profile — free.
            </p>
            <Link to="/running-profiler/profile">
              <PrimaryButton type="button">Go Back &amp; Add Email →</PrimaryButton>
            </Link>
          </div>
        )}

        {emailUsed && (
          <div
            style={{
              padding: "16px 20px",
              background: "var(--panel-800)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              color: "var(--text-secondary)",
            }}
          >
            📧 Your full report has been sent to <strong>{emailUsed}</strong>.
          </div>
        )}
      </div>
    </Shell>
  );
}
