import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { SplitTable } from "../components/SplitTable";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { MetricCard } from "../components/MetricCard";
import { SideStepper } from "../components/SideStepper";
import { loadDraft, saveDraft } from "../utils/storage";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { trackEvent } from "../utils/api";
import { SEGMENTS } from "../data/segments";
import type { HyroxSplit } from "../types";
import styles from "./SplitEntryPage.module.css";

export function SplitEntryPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const finishSeconds = draft?.race?.finishTimeSeconds ?? 0;

  // Raw string values per segment key
  const [rawValues, setRawValues] = useState<Record<string, string>>(() => {
    if (!draft?.splits?.length) return {};
    const map: Record<string, string> = {};
    for (const s of draft.splits) {
      if (s.timeSeconds > 0) map[s.segmentKey] = formatSeconds(s.timeSeconds);
    }
    return map;
  });

  const parsedSeconds = useMemo<Record<string, number | null>>(() => {
    const result: Record<string, number | null> = {};
    for (const seg of SEGMENTS) {
      const raw = rawValues[seg.segmentKey] ?? "";
      result[seg.segmentKey] = raw ? parseTimeToSeconds(raw) : null;
    }
    return result;
  }, [rawValues]);

  const splitTotal = useMemo(() => {
    return Object.values(parsedSeconds).reduce<number>(
      (sum, v) => sum + (v ?? 0),
      0,
    );
  }, [parsedSeconds]);

  const remaining = finishSeconds - splitTotal;
  const isOver = finishSeconds > 0 && splitTotal > finishSeconds + 5;

  function handleChange(segmentKey: string, rawValue: string) {
    setRawValues((prev) => {
      const next = { ...prev, [segmentKey]: rawValue };
      // Persist to draft after each change
      const splits: HyroxSplit[] = SEGMENTS.map((seg) => ({
        index: seg.index,
        segmentKey: seg.segmentKey,
        label: seg.label,
        type: seg.type,
        timeSeconds: parsedSeconds[seg.segmentKey] ?? 0,
      }));
      saveDraft({ splits });
      return next;
    });
  }

  function handleClearAll() {
    setRawValues({});
    saveDraft({ splits: [] });
  }

  function handleNext() {
    // Build splits array from valid entries
    const splits: HyroxSplit[] = SEGMENTS.map((seg) => ({
      index: seg.index,
      segmentKey: seg.segmentKey,
      label: seg.label,
      type: seg.type,
      timeSeconds: parsedSeconds[seg.segmentKey] ?? 0,
    }));
    saveDraft({ splits });
    trackEvent("splits_completed");
    void navigate("/hyrox-calculator/context");
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={2} />
        <div className={styles.layout}>
          <FormPanel className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Enter Your Split Times</h2>
              <div className={styles.utilityActions}>
                <button
                  type="button"
                  className={styles.utilBtn}
                  onClick={handleClearAll}
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className={styles.tableScroll}>
              <SplitTable
                segments={SEGMENTS}
                values={rawValues}
                onChange={handleChange}
                parsedSeconds={parsedSeconds}
              />
            </div>
            {isOver && (
              <div className={styles.warningBanner}>
                ⚠ Split total ({formatSeconds(splitTotal)}) exceeds finish time
                ({formatSeconds(finishSeconds)}). Please check your splits.
              </div>
            )}
            <div className={styles.actions}>
              <SecondaryButton
                type="button"
                onClick={() => void navigate("/hyrox-calculator")}
              >
                ← Back
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleNext}>
                Continue: Add Context →
              </PrimaryButton>
            </div>
          </FormPanel>

          {/* Right summary card */}
          <div className={styles.sideCard}>
            <FormPanel>
              <div className={styles.sideTitle}>Live Race Summary</div>
              <div className={styles.summaryRows}>
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>Finish Time</div>
                  <div className={styles.summaryValue}>
                    {finishSeconds > 0
                      ? formatSeconds(finishSeconds, "HH:MM:SS")
                      : "—"}
                  </div>
                </div>
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>Splits Entered</div>
                  <div className={styles.summaryValue}>
                    {
                      Object.values(parsedSeconds).filter((v) => v !== null)
                        .length
                    }
                    {" / 16"}
                  </div>
                </div>
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>Splits Total</div>
                  <div className={styles.summaryValue}>
                    {splitTotal > 0 ? formatSeconds(splitTotal) : "—"}
                  </div>
                </div>
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>Unallocated</div>
                  <div
                    className={[
                      styles.summaryValue,
                      isOver ? styles.over : remaining > 0 ? styles.good : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {finishSeconds > 0 && splitTotal > 0
                      ? (isOver ? "-" : "") +
                        formatSeconds(Math.abs(remaining))
                      : "—"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <MetricCard
                  title="Roxzone (est.)"
                  value={
                    finishSeconds > 0 && splitTotal > 0 && !isOver
                      ? formatSeconds(remaining)
                      : "—"
                  }
                  sub="Calculated server-side from unallocated time"
                  accent={isOver ? "red" : "default"}
                />
              </div>
            </FormPanel>
          </div>
        </div>
      </div>
    </Shell>
  );
}
