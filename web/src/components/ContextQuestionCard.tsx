import type { ReactNode } from "react";
import styles from "./ContextQuestionCard.module.css";

interface ContextQuestionCardProps {
  question: string;
  required?: boolean;
  children: ReactNode;
}

export function ContextQuestionCard({
  question,
  required,
  children,
}: ContextQuestionCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.question}>
        {question}
        {required && <span className={styles.required}>*</span>}
      </div>
      {children}
    </div>
  );
}
