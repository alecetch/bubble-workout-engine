import styles from "./RecommendationCard.module.css";

interface RecommendationCardProps {
  rank: number;
  title: string;
  impact: "low" | "medium" | "high";
  why: string;
  example: string;
}

export function RecommendationCard({
  rank,
  title,
  impact,
  why,
  example,
}: RecommendationCardProps) {
  const impactCls = [styles.impact, styles[impact]].join(" ");
  return (
    <div className={styles.card} data-testid={`recommendation-${rank}`}>
      <div className={styles.header}>
        <div className={styles.rank}>{rank}</div>
        <div className={styles.title}>{title}</div>
        <div className={impactCls}>{impact}</div>
      </div>
      <p className={styles.why}>{why}</p>
      <div className={styles.example}>
        <span className={styles.exampleLabel}>Example: </span>
        {example}
      </div>
    </div>
  );
}
