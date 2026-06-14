import type { SelectHTMLAttributes } from "react";
import styles from "./SelectInput.module.css";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  required?: boolean;
  error?: string;
}

export function SelectInput({
  label,
  options,
  required,
  error,
  id,
  ...rest
}: SelectInputProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <select id={selectId} className={styles.select} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  );
}
