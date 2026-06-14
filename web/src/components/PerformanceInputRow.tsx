import { SelectInput } from "./SelectInput";
import styles from "./PerformanceInputRow.module.css";

export interface PerformanceRowValue {
  timeRaw: string;
  approxDate: string;
  recency: string;
}

interface PerformanceInputRowProps {
  distance: string;
  label: string;
  sub?: string;
  value: PerformanceRowValue;
  onChange: (val: PerformanceRowValue) => void;
}

const RECENCY_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "within_6_months", label: "Within 6 months" },
  { value: "6_18_months", label: "6–18 months ago" },
  { value: "historic", label: "Historical" },
];

export function PerformanceInputRow({
  distance,
  label,
  sub,
  value,
  onChange,
}: PerformanceInputRowProps) {
  const isHistoric = value.recency === "historic";

  return (
    <div className={styles.row} data-testid={`perf-row-${distance}`}>
      <div className={styles.distanceLabel}>
        {label}
        {sub && <span className={styles.distanceSub}>{sub}</span>}
        {isHistoric && value.timeRaw && (
          <span className={styles.historicNote}>
            Historical — not used as current capability
          </span>
        )}
      </div>
      <div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
            display: "block",
            marginBottom: 5,
          }}
        >
          Time
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="MM:SS or H:MM:SS"
          value={value.timeRaw}
          onChange={(e) => onChange({ ...value, timeRaw: e.target.value })}
          style={{
            background: "var(--bg-850)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontSize: 14,
            width: "100%",
            fontVariantNumeric: "tabular-nums",
          }}
          aria-label={`${label} time`}
        />
      </div>
      <div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
            display: "block",
            marginBottom: 5,
          }}
        >
          Approx Date
        </label>
        <input
          type="month"
          value={value.approxDate}
          onChange={(e) => onChange({ ...value, approxDate: e.target.value })}
          style={{
            background: "var(--bg-850)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontSize: 14,
            width: "100%",
          }}
          aria-label={`${label} date`}
        />
      </div>
      <SelectInput
        label="Recency"
        options={RECENCY_OPTIONS}
        value={value.recency}
        onChange={(e) => onChange({ ...value, recency: e.target.value })}
      />
    </div>
  );
}
