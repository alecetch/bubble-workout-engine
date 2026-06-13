import type { InputHTMLAttributes } from "react";
import styles from "./TimeInput.module.css";

interface TimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export function TimeInput({
  label,
  required,
  error,
  hint,
  id,
  ...rest
}: TimeInputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <div className={styles.inputRow}>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          className={[styles.input, error ? styles.error : ""]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      </div>
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  );
}
