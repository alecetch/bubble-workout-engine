import { useNavigate } from "react-router-dom";
import { Shell } from "../../components/Shell";
import { PrimaryButton } from "../../components/PrimaryButton";
import styles from "./RunningProfilerLandingPage.module.css";

const FEATURES = [
  {
    title: "Not just pace",
    copy: "We look beyond pace to see the full picture — volume, balance, background, and hybrid performance impact.",
  },
  {
    title: "Performance translation",
    copy: "See how your running impacts HYROX, DEKA and other competitions. Get a projected race contribution from your current numbers.",
  },
  {
    title: "Trade-off insights",
    copy: "Understand how training choices affect strength, muscle retention, and performance. Running is a tool — not a goal.",
  },
  {
    title: "Actionable guidance",
    copy: "Get clear, ranked recommendations on what to focus on next. Not generic advice — specific to your goals and background.",
  },
];

export function RunningProfilerLandingPage() {
  const navigate = useNavigate();

  return (
    <Shell>
      <div className={styles.page} data-testid="landing-page">
        <div className={styles.layout}>
          <div className={styles.heroCol}>
            <div className={styles.eyebrow}>Forma — MEASURE. UNDERSTAND. IMPROVE.</div>
            <h1 className={styles.headline} data-testid="landing-headline">
              Running is a tool.
              <br />
              Performance is the mission.
            </h1>
            <p className={styles.sub}>Running &amp; Hybrid Performance Profiler</p>
            <p className={styles.description}>
              Understand how your running supports your overall performance. Find
              the right balance between speed, strength, muscle and durability.
            </p>
            <ul className={styles.bullets}>
              {[
                "Find your balance between running and strength",
                "See which improvements will have the biggest impact on your goals",
                "Reduce injury risk and build a body that lasts",
                "Understand whether your running is helping or holding back your hybrid performance",
              ].map((b) => (
                <li key={b} className={styles.bullet}>
                  <span className={styles.bulletIcon}>→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <PrimaryButton
              type="button"
              onClick={() => void navigate("/running-profiler/profile")}
              data-testid="start-cta"
            >
              Start Your Analysis →
            </PrimaryButton>
            <p className={styles.free}>
              100% free. Always will be. No sign-up required.
            </p>
          </div>

          <div className={styles.rightCol}>
            <div className={styles.rightPanel}>
              <h2 className={styles.rightTitle}>Built for hybrid athletes</h2>
              <p className={styles.rightCopy}>
                The analysis traditional runners don&apos;t get. Because you&apos;re
                not just a runner. You&apos;re a hybrid athlete. Your training
                choices involve trade-offs between speed, strength, muscle, and
                durability — and this profiler accounts for all of them.
              </p>
              <div className={styles.features}>
                {FEATURES.map((f) => (
                  <div key={f.title} className={styles.feature}>
                    <div className={styles.featureTitle}>→ {f.title}</div>
                    <div className={styles.featureCopy}>{f.copy}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
