import { useEffect, useId, useState } from "react";
import { kgToLb, lbToKg } from "../utils/unitConversion";
import styles from "./MeasuredFields.module.css";

interface WeightFieldProps {
  label: string;
  valueKg?: number;
  unit: "kg" | "lb";
  onChangeKg: (kg: number | undefined) => void;
  min: number;
  max: number;
  error?: string;
  required?: boolean;
  hint?: string;
}

function displayValue(valueKg: number | undefined, unit: "kg" | "lb"): string {
  if (valueKg === undefined || !Number.isFinite(valueKg)) return "";
  return String(Math.round(unit === "lb" ? kgToLb(valueKg) : valueKg));
}

export function WeightField({ label, valueKg, unit, onChangeKg, min, max, error, required, hint }: WeightFieldProps) {
  const id = useId();
  const [raw, setRaw] = useState(displayValue(valueKg, unit));

  useEffect(() => {
    setRaw(displayValue(valueKg, unit));
  }, [unit, valueKg]);

  function handleChange(nextRaw: string) {
    setRaw(nextRaw);
    if (!nextRaw.trim()) {
      onChangeKg(undefined);
      return;
    }
    const value = Number(nextRaw);
    onChangeKg(Number.isFinite(value) ? (unit === "lb" ? lbToKg(value) : value) : undefined);
  }

  return (
    <div className={styles.numberField}>
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      <input id={id} type="number" min={unit === "lb" ? Math.round(kgToLb(min)) : min} max={unit === "lb" ? Math.round(kgToLb(max)) : max} value={raw} onChange={(event) => handleChange(event.target.value)} />
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
