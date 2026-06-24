import type { ReactNode } from "react";
import styles from "./MetricCard.module.css";

interface MetricCardProps {
  title: string;
  value: ReactNode;
  sub?: string;
  accent?: "default" | "red" | "green" | "cyan" | "amber" | "blue";
}

export function MetricCard({
  title,
  value,
  sub,
  accent = "default",
}: MetricCardProps) {
  const valueCls = [
    styles.value,
    accent === "cyan" ? styles.accent : "",
    accent === "red" ? styles.red : "",
    accent === "green" ? styles.green : "",
    accent === "amber" ? styles.amber : "",
    accent === "blue" ? styles.blue : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.card}>
      <div className={styles.title}>{title}</div>
      <div className={valueCls}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}
