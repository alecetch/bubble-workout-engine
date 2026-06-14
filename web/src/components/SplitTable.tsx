import type { SegmentDefinition } from "../types";
import styles from "./SplitTable.module.css";

interface SplitTableProps {
  segments: SegmentDefinition[];
  values: Record<string, string>;
  onChange: (segmentKey: string, rawValue: string) => void;
  parsedSeconds: Record<string, number | null>;
}

export function SplitTable({
  segments,
  values,
  onChange,
  parsedSeconds,
}: SplitTableProps) {
  return (
    <table className={styles.table}>
      <thead className={styles.thead}>
        <tr>
          <th>#</th>
          <th>Segment</th>
          <th>Time</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {segments.map((seg) => {
          const rawVal = values[seg.segmentKey] ?? "";
          const parsed = parsedSeconds[seg.segmentKey];
          const hasValue = rawVal.trim().length > 0;
          const isValid = parsed !== null;
          const isMissing = !hasValue;

          return (
            <tr key={seg.segmentKey} className={styles.row}>
              <td className={styles.indexCell}>{seg.index}</td>
              <td className={styles.labelCell}>
                <div className={styles.labelInner}>
                  <span className={styles.segLabel}>{seg.label}</span>
                  <span
                    className={[
                      styles.typeTag,
                      seg.type === "run" ? styles.run : styles.station,
                    ].join(" ")}
                  >
                    {seg.type === "run" ? "RUN" : "STATION"}
                  </span>
                </div>
              </td>
              <td className={styles.inputCell}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={[
                    styles.input,
                    isMissing ? styles.missing : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  placeholder={seg.type === "run" ? "5:23" : "3:42"}
                  value={rawVal}
                  onChange={(e) => onChange(seg.segmentKey, e.target.value)}
                  aria-label={`${seg.label} time`}
                />
              </td>
              <td className={styles.statusCell}>
                {hasValue && isValid && (
                  <span style={{ color: "var(--accent-green)", fontSize: 13 }}>
                    ✓
                  </span>
                )}
                {hasValue && !isValid && (
                  <span style={{ color: "var(--accent-red)", fontSize: 13 }}>
                    ✗
                  </span>
                )}
                {!hasValue && (
                  <span style={{ color: "var(--accent-amber)", fontSize: 11 }}>
                    —
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

