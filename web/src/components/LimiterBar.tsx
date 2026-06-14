import styles from "./LimiterBar.module.css";

interface LimiterBarProps {
  rank: number;
  title: string;
  impact: "low" | "medium" | "high";
  why: string;
}

export function LimiterBar({ rank, title, impact, why }: LimiterBarProps) {
  const impactCls = [styles.impact, styles[impact]].join(" ");
  return (
    <div className={styles.limiter}>
      <div className={styles.header}>
        <div className={styles.rank}>{rank}</div>
        <div className={styles.title}>{title}</div>
        <div className={impactCls}>{impact}</div>
      </div>
      <p className={styles.why}>{why}</p>
    </div>
  );
}
