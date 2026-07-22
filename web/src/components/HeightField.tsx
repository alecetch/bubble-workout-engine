import { useEffect, useId, useState } from "react";
import { cmToFeetInches, feetInchesToCm } from "../utils/unitConversion";
import styles from "./MeasuredFields.module.css";

interface HeightFieldProps {
  label: string;
  valueCm?: number;
  unit: "cm" | "ftin";
  onChangeCm: (cm: number | undefined) => void;
  min: number;
  max: number;
  error?: string;
  hint?: string;
}

export function HeightField({ label, valueCm, unit, onChangeCm, min, max, error, hint }: HeightFieldProps) {
  const id = useId();
  const feetId = useId();
  const inchesId = useId();
  const [cmRaw, setCmRaw] = useState(valueCm === undefined ? "" : String(Math.round(valueCm)));
  const [feetRaw, setFeetRaw] = useState("");
  const [inchesRaw, setInchesRaw] = useState("");

  useEffect(() => {
    if (valueCm === undefined || !Number.isFinite(valueCm)) {
      setCmRaw("");
      setFeetRaw("");
      setInchesRaw("");
      return;
    }
    if (unit === "cm") {
      setCmRaw(String(Math.round(valueCm)));
    } else {
      const { feet, inches } = cmToFeetInches(valueCm);
      setFeetRaw(String(feet));
      setInchesRaw(String(inches));
    }
  }, [unit, valueCm]);

  function updateFtIn(nextFeetRaw: string, nextInchesRaw: string) {
    setFeetRaw(nextFeetRaw);
    setInchesRaw(nextInchesRaw);
    if (!nextFeetRaw.trim() && !nextInchesRaw.trim()) {
      onChangeCm(undefined);
      return;
    }
    const feet = Number(nextFeetRaw || 0);
    const inches = Number(nextInchesRaw || 0);
    onChangeCm(Number.isFinite(feet) && Number.isFinite(inches) ? feetInchesToCm(feet, inches) : undefined);
  }

  return (
    <div className={styles.numberField}>
      <label htmlFor={unit === "cm" ? id : feetId}>{label}</label>
      {unit === "cm" ? (
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={cmRaw}
          onChange={(event) => {
            const nextRaw = event.target.value;
            setCmRaw(nextRaw);
            onChangeCm(nextRaw.trim() ? Number(nextRaw) : undefined);
          }}
        />
      ) : (
        <div className={styles.splitInputs}>
          <div className={styles.splitInput}>
            <label className={styles.subLabel} htmlFor={feetId}>Feet</label>
            <input id={feetId} type="number" min={3} max={7} value={feetRaw} onChange={(event) => updateFtIn(event.target.value, inchesRaw)} />
          </div>
          <div className={styles.splitInput}>
            <label className={styles.subLabel} htmlFor={inchesId}>Inches</label>
            <input id={inchesId} type="number" min={0} max={11} value={inchesRaw} onChange={(event) => updateFtIn(feetRaw, event.target.value)} />
          </div>
        </div>
      )}
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
