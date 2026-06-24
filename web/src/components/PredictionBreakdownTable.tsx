import type { PredictedSegment } from "../types";
import { formatSeconds } from "../utils/time";
import styles from "./PredictionBreakdownTable.module.css";

interface Props {
  segments: PredictedSegment[];
  totalSeconds: number;
  roxzoneSeconds: number;
}

function statusFor(score: number): "green" | "amber" | "red" {
  if (score < 0.05) return "green";
  if (score <= 0.15) return "amber";
  return "red";
}

export function PredictionBreakdownTable({ segments, totalSeconds, roxzoneSeconds }: Props) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Segment</th>
            <th>Predicted Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => {
            const status = statusFor(segment.limiterScore);
            return (
              <tr key={segment.segmentKey}>
                <td>{segment.label}</td>
                <td>{segment.predictedFormatted}</td>
                <td><span className={[styles.dot, styles[status]].join(" ")} aria-label={status} /></td>
              </tr>
            );
          })}
          <tr className={styles.roxzone}>
            <td>RoxZone transitions</td>
            <td>{formatSeconds(Math.max(0, roxzoneSeconds), "HH:MM:SS")}</td>
            <td><span className={[styles.dot, styles.amber].join(" ")} aria-label="amber" /></td>
          </tr>
          <tr className={styles.total}>
            <td>Total</td>
            <td>{formatSeconds(totalSeconds, "HH:MM:SS")}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
