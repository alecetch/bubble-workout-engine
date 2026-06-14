import styles from "./MultiSelectChipGroup.module.css";

interface ChipOption {
  value: string;
  label: string;
}

interface MultiSelectChipGroupProps {
  label: string;
  options: ChipOption[];
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
  maxSelect?: number;
}

export function MultiSelectChipGroup({
  label,
  options,
  values,
  onChange,
  required,
  maxSelect,
}: MultiSelectChipGroupProps) {
  function toggle(value: string) {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      if (maxSelect && values.length >= maxSelect) return;
      onChange([...values, value]);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
        {maxSelect && (
          <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 6 }}>
            (select up to {maxSelect})
          </span>
        )}
      </div>
      <div className={styles.chips}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={[
              styles.chip,
              values.includes(opt.value) ? styles.selected : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
