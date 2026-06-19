import type { ReactNode } from "react";
import styles from "./ContextQuestionCard.module.css";

interface ContextQuestionCardProps {
  question: string;
  number?: number;
  required?: boolean;
  children: ReactNode;
}

export function ContextQuestionCard({
  question,
  number,
  required,
  children,
}: ContextQuestionCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.questionRow}>
        {number && <span className={styles.badge}>{number}</span>}
        <div className={styles.question}>
          {question}
          {required && <span className={styles.required}>*</span>}
        </div>
      </div>
      {children}
    </div>
  );
}
