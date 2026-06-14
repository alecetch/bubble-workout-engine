import styles from "./OptionCardGroup.module.css";

interface OptionCard {
  value: string;
  label: string;
}

interface OptionCardGroupProps {
  label: string;
  options: OptionCard[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function OptionCardGroup({
  label,
  options,
  value,
  onChange,
  required,
}: OptionCardGroupProps) {
  return (
    <div className={styles.group}>
      <div className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </div>
      <div className={styles.options}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={[
              styles.card,
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
