import styles from "./ConfidenceMeter.module.css";

interface Props {
  score: number;
  label: string;
}

export function ConfidenceMeter({ score, label }: Props) {
  const clamped = Math.max(0, Math.min(1, score));
  const tone = clamped < 0.45 ? "red" : clamped < 0.65 ? "amber" : "green";
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span>Confidence</span>
        <strong>{label.charAt(0).toUpperCase() + label.slice(1)} · {Math.round(clamped * 100)}%</strong>
      </div>
      <div className={styles.track}>
        <div className={[styles.fill, styles[tone]].join(" ")} style={{ width: `${Math.round(clamped * 100)}%` }} />
      </div>
    </div>
  );
}
