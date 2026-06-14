import type { ReactNode } from "react";
import styles from "./FormPanel.module.css";

interface FormPanelProps {
  children: ReactNode;
  className?: string;
}

export function FormPanel({ children, className }: FormPanelProps) {
  return (
    <div className={[styles.panel, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
