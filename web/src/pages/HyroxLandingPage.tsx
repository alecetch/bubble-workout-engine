import { Link } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { Shell } from "../components/Shell";
import styles from "./HyroxLandingPage.module.css";

export function HyroxLandingPage() {
  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>HYROX tools</div>
          <h1>Choose your starting point</h1>
          <p>Use race splits for improvement analysis, or benchmark inputs for a finish-time prediction.</p>
        </div>
        <div className={styles.grid}>
          <FormPanel className={styles.card}>
            <span className={styles.chip}>HYROX result required</span>
            <h2>Analyse my result</h2>
            <p>Enter your finish time and splits to find where you lost time and how to reach your target.</p>
            <Link to="/hyrox-calculator" className={styles.button}>Analyse my result -&gt;</Link>
          </FormPanel>
          <FormPanel className={styles.card}>
            <span className={styles.chipAlt}>No race needed</span>
            <h2>Predict my time</h2>
            <p>No recent HYROX result? Use your running and strength benchmarks to estimate your finish time.</p>
            <Link to="/hyrox-predictor" className={styles.button}>Get my prediction -&gt;</Link>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
