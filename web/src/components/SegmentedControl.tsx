import styles from "./SegmentedControl.module.css";

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  required,
}: SegmentedControlProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </div>
      <div className={styles.control}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={[
              styles.option,
              value === opt.value ? styles.selected : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
