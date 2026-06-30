import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { Shell } from "../components/Shell";
import { trackEvent } from "../utils/api";
import styles from "./HyroxLandingPage.module.css";

export function HyroxLandingPage() {
  useEffect(() => {
    trackEvent("hyrox_landing_viewed");
  }, []);

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>HYROX TOOLS</div>
          <h1>Turn your HYROX result into a training direction.</h1>
          <p>
            Analyse a completed race, predict your first HYROX, or work backwards
            from a target time.
          </p>
        </div>
        <div className={styles.grid}>
          <FormPanel className={styles.card}>
            <span className={styles.chip}>HYROX result required</span>
            <h2>Analyse my race</h2>
            <p>
              Paste your HYROX result and get a benchmarked report showing where you
              lost time, what held you back, and what to train next.
            </p>
            <p className={styles.bestFor}>Best for: athletes who have completed a HYROX.</p>
            <Link
              to="/hyrox-calculator/race-details"
              className={styles.button}
              onClick={() => trackEvent("mode_card_clicked", { selectedMode: "analyse" })}
            >
              Analyse my race
            </Link>
          </FormPanel>
          <FormPanel className={styles.card}>
            <span className={styles.chipAlt}>No race needed</span>
            <h2>Predict my first HYROX</h2>
            <p>
              No race result yet? Estimate your likely finish time from your current
              running and strength markers.
            </p>
            <p className={styles.bestFor}>Best for: athletes preparing for their first HYROX.</p>
            <Link
              to="/hyrox-predictor"
              className={styles.button}
              onClick={() => trackEvent("mode_card_clicked", { selectedMode: "predict" })}
            >
              Predict my race time
            </Link>
          </FormPanel>
          <FormPanel className={styles.card}>
            <span className={styles.chipMuted}>Works best with a race result</span>
            <h2>Hit a target time</h2>
            <p>Set a goal time and see the gaps you need to close.</p>
            <p className={styles.helperText}>
              Works best once Forma has your latest race data.
            </p>
            <Link
              to="/hyrox-calculator/race-details"
              className={styles.button}
              onClick={() => trackEvent("analyse_first_clicked", { source: "target_card" })}
            >
              Analyse my race first
            </Link>
            <Link
              to="/hyrox-calculator/race-details?mode=target"
              className={styles.textLink}
              onClick={() => trackEvent("target_continue_anyway_clicked", { source: "target_card" })}
            >
              I already know my target -&gt;
            </Link>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
