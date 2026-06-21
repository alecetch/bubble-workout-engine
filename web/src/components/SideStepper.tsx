import styles from "./SideStepper.module.css";

const STEPS = [
  { label: "Race Details" },
  { label: "Splits" },
  { label: "Context" },
  { label: "Review" },
];

interface SideStepperProps {
  current: number;
}

export function SideStepper({ current }: SideStepperProps) {
  return (
    <div className={styles.stepper}>
      {STEPS.map((step, i) => {
        const num = i + 1;
        const isDone = num < current;
        const isActive = num === current;
        const cls = [
          styles.step,
          isDone ? styles.done : "",
          isActive ? styles.active : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
            <div className={cls}>
              <div className={styles.circle}>{isDone ? "✓" : String(num)}</div>
              <span className={styles.label}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={styles.connector} />}
          </div>
        );
      })}
    </div>
  );
}
