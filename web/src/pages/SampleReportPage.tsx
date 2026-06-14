import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatSeconds } from "../utils/time";
import { trackEvent } from "../utils/api";
import { SAMPLE_FIXTURE } from "../data/segments";
import styles from "./SampleReportPage.module.css";

export function SampleReportPage() {
  useEffect(() => {
    trackEvent("sample_report_viewed");
  }, []);

  const splitTotal = SAMPLE_FIXTURE.splits.reduce(
    (sum, s) => sum + s.timeSeconds,
    0,
  );
  const roxzone = SAMPLE_FIXTURE.race.finishTimeSeconds - splitTotal;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.badge}>Sample Report</div>
        <h1 className={styles.headline}>Sample Performance Analysis</h1>
        <p className={styles.subline}>
          This is an example of the personalised report you'll receive after
          entering your HYROX result. John, Manchester 2024, Open division.
        </p>

        {/* Summary metrics */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Race Overview</div>
          <div className={styles.metricsRow}>
            <MetricCard
              title="Finish Time"
              value={formatSeconds(
                SAMPLE_FIXTURE.race.finishTimeSeconds,
                "HH:MM:SS",
              )}
              sub={`${SAMPLE_FIXTURE.race.raceName}`}
            />
            <MetricCard
              title="Splits Total"
              value={formatSeconds(splitTotal)}
              sub="16 segments entered"
            />
            <MetricCard
              title="Roxzone"
              value={formatSeconds(roxzone)}
              sub="transitions + unallocated"
              accent="cyan"
            />
            <MetricCard
              title="Division"
              value={SAMPLE_FIXTURE.race.division.toUpperCase()}
              sub={`Age ${SAMPLE_FIXTURE.athlete.ageOnRaceDay}`}
            />
          </div>
        </div>

        {/* Splits table */}
        <div className={styles.section}>
          <FormPanel>
            <div className={styles.sectionTitle}>Split Breakdown</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Segment</th>
                  <th>Type</th>
                  <th>Time</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_FIXTURE.splits.map((split) => (
                  <tr key={split.segmentKey}>
                    <td>{split.index}</td>
                    <td>{split.label}</td>
                    <td
                      style={{
                        color:
                          split.type === "run"
                            ? "var(--accent-cyan)"
                            : "var(--accent-blue)",
                        textTransform: "uppercase",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {split.type}
                    </td>
                    <td
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: "Inter Tight, Inter, sans-serif",
                        fontWeight: 600,
                      }}
                    >
                      {formatSeconds(split.timeSeconds)}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {(
                        (split.timeSeconds /
                          SAMPLE_FIXTURE.race.finishTimeSeconds) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FormPanel>
        </div>

        {/* Sample insights */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Sample Insights</div>
          {[
            {
              title: "Wall Balls — Your Biggest Limiter",
              body: "Your Wall Balls split of 6:31 represents 12.5% of your total finish time and places you below the 40th percentile for Open Male 60–64. Improving efficiency here is your clearest path to a sub-80-minute finish.",
            },
            {
              title: "Strong Running Economy",
              body: "Your average 1km run split of 5:16 is consistent and competitive for your age group. Run splits range from 5:11–5:39, showing good pacing discipline across a 1h 25m effort.",
            },
            {
              title: "Sled Work — High Relative Cost",
              body: "Sled Push + Sled Pull account for 7:13 combined (8.4% of finish time). Increasing sled capacity with targeted progressive overload could yield 60–90 seconds of gain.",
            },
          ].map((ins) => (
            <div key={ins.title} className={styles.insight}>
              <div className={styles.insightTitle}>{ins.title}</div>
              <div className={styles.insightBody}>{ins.body}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={styles.ctaBox}>
          <h2 className={styles.ctaTitle}>Get your personalised analysis</h2>
          <p className={styles.ctaSub}>
            Enter your own race result and receive a full breakdown like this
            one, tailored to your splits and training background — free.
          </p>
          <Link to="/hyrox-calculator">
            <PrimaryButton type="button">
              Analyse My Result →
            </PrimaryButton>
          </Link>
        </div>
      </div>
    </Shell>
  );
}
