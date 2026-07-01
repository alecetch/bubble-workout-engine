import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { SplitTable } from "../components/SplitTable";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SideStepper } from "../components/SideStepper";
import { getJourneyVariant, isRestoredTargetBranch } from "../utils/journeyUtils";
import { loadDraft, saveDraft } from "../utils/storage";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { trackEvent } from "../utils/api";
import { SEGMENTS } from "../data/segments";
import type { HyroxSplit } from "../types";
import styles from "./SplitEntryPage.module.css";

const MAX_REASONABLE_REPLAY_DIFF_SECONDS = 10 * 60;
const ROXZONE_DISPLAY_STATIONS = [
  "ski_erg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
];

function stationLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sumNullableSeconds(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function formatSignedSeconds(seconds: number): string {
  if (seconds === 0) return "0:00";
  return `${seconds > 0 ? "+" : "-"}${formatSeconds(Math.abs(seconds))}`;
}

export function SplitEntryPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const finishSeconds = draft?.race?.finishTimeSeconds ?? 0;
  const raceReplay = draft?.raceReplay ?? [];
  const [showRoxzoneDetail, setShowRoxzoneDetail] = useState(false);

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
  const splitsEntered = Object.values(parsedSeconds).filter((v) => v !== null).length;
  const officialRoxzoneSeconds = draft?.roxzoneTimeSeconds ?? (finishSeconds > 0 && splitTotal > 0 && !isOver ? remaining : null);
  const replayLooksLikeClockValues = raceReplay.some((item) =>
    [item.entrySeconds, item.exitSeconds].some((value) => value != null && value > MAX_REASONABLE_REPLAY_DIFF_SECONDS),
  );
  const replayRowsForSummary = replayLooksLikeClockValues
    ? []
    : raceReplay.filter((item) => item.entrySeconds !== null && item.exitSeconds !== null);
  const replayStationSummaries = replayRowsForSummary
    .map((item) => ({
      ...item,
      roxzoneSeconds: sumNullableSeconds([item.entrySeconds, item.exitSeconds]),
    }))
    .filter((item) => item.roxzoneSeconds !== null);
  const replayStationMap = new Map(replayStationSummaries.map((item) => [item.station, item]));
  const replayDisplayRows = ROXZONE_DISPLAY_STATIONS.map((station) => {
    const item = replayStationMap.get(station);
    return {
      station,
      entrySeconds: item?.entrySeconds ?? null,
      exitSeconds: item?.exitSeconds ?? null,
      roxzoneSeconds: item?.roxzoneSeconds ?? null,
      measurable: Boolean(item),
    };
  });
  const replayTotal = replayStationSummaries.reduce((sum, item) => sum + (item.roxzoneSeconds ?? 0), 0);
  const hasReplayTotals = replayStationSummaries.length > 0;
  const replayRoundingDifference = officialRoxzoneSeconds != null && hasReplayTotals
    ? officialRoxzoneSeconds - replayTotal
    : null;
  const hasReplayRoundingDifference = replayRoundingDifference !== null && Math.abs(replayRoundingDifference) > 0;
  const roxzoneVarianceAcceptable = replayRoundingDifference !== null && Math.abs(replayRoundingDifference) <= 5;
  const importedFromHyrox = raceReplay.length > 0 || draft?.roxzoneTimeSeconds != null;
  const slowestReplay = [...replayStationSummaries]
    .sort((a, b) => (b.roxzoneSeconds ?? 0) - (a.roxzoneSeconds ?? 0))[0] ?? null;

  function handleChange(segmentKey: string, rawValue: string) {
    setRawValues((prev) => {
      const next = { ...prev, [segmentKey]: rawValue };
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
    const splits: HyroxSplit[] = SEGMENTS.map((seg) => ({
      index: seg.index,
      segmentKey: seg.segmentKey,
      label: seg.label,
      type: seg.type,
      timeSeconds: parsedSeconds[seg.segmentKey] ?? 0,
    }));
    saveDraft({ splits });
    trackEvent("splits_completed");
    const variant = getJourneyVariant(loadDraft());
    void navigate(isRestoredTargetBranch(variant) ? "/hyrox-calculator/target-calibration" : "/hyrox-calculator/context");
  }

  return (
    <Shell>
      <div className={styles.page}>
        <SideStepper current={2} />
        <div className={styles.introCard}>
          <div>
            <h1 className={styles.introTitle}>Check your imported splits</h1>
            <p className={styles.introCopy}>
              This step is a quality check, not a test. Confirm the 16 segment times and RoxZone reconciliation before adding training context.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={[styles.statusChip, importedFromHyrox ? styles.goodChip : styles.neutralChip].join(" ")}>
              {importedFromHyrox ? "Imported from HYROX" : "Manual entry"}
            </span>
            <span className={[styles.statusChip, splitsEntered === 16 ? styles.goodChip : styles.warnChip].join(" ")}>
              {splitsEntered}/16 complete
            </span>
            <span className={[styles.statusChip, roxzoneVarianceAcceptable ? styles.goodChip : replayRoundingDifference === null ? styles.neutralChip : styles.warnChip].join(" ")}>
              {roxzoneVarianceAcceptable
                ? `RoxZone variance ${formatSignedSeconds(replayRoundingDifference)}`
                : replayRoundingDifference === null
                  ? "RoxZone pending"
                  : "RoxZone needs review"}
            </span>
          </div>
        </div>
        <div className={styles.layout}>
          <FormPanel className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <h2 className={styles.tableTitle}>Split times</h2>
                <p className={styles.tableSubcopy}>Review imported values or edit manually.</p>
              </div>
              <div className={styles.utilityActions}>
                {/* TODO: Add a supported Screen 2 paste flow before showing a Paste splits action here. */}
                <button type="button" className={styles.utilBtn} onClick={handleClearAll}>
                  Clear all
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
                Split total ({formatSeconds(splitTotal)}) exceeds finish time ({formatSeconds(finishSeconds)}).
                Please check your splits.
              </div>
            )}
            <div className={styles.actions}>
              <div className={splitsEntered === 16 ? styles.actionStatusGood : styles.actionStatusWarn}>
                {splitsEntered}/16 complete
              </div>
              <SecondaryButton type="button" className={styles.compactButton} onClick={() => void navigate("/hyrox-calculator/race-details")}>
                Back
              </SecondaryButton>
              <PrimaryButton type="button" className={styles.compactButton} onClick={handleNext}>
                Continue: Add Context
              </PrimaryButton>
            </div>
          </FormPanel>

          <div className={styles.sideCard}>
            <FormPanel className={styles.summaryPanel}>
              <div className={styles.sideTitle}>Data check</div>
              <div className={styles.verdict}>
                {roxzoneVarianceAcceptable || replayRoundingDifference === null
                  ? "Imported result looks coherent"
                  : "RoxZone needs review"}
              </div>
              <p className={styles.verdictCopy}>
                {roxzoneVarianceAcceptable || replayRoundingDifference === null
                  ? "Splits and RoxZone replay agree closely enough to continue."
                  : "Review the imported RoxZone replay values before continuing."}
              </p>

              <div className={styles.summarySection} data-testid="workout-summary-card">
                <div className={styles.summaryRows}>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Finish</div>
                    <div className={styles.summaryValue}>
                      {finishSeconds > 0 ? formatSeconds(finishSeconds, "HH:MM:SS") : "-"}
                    </div>
                  </div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Splits Total</div>
                    <div className={styles.summaryValue}>
                      {splitTotal > 0 ? formatSeconds(splitTotal) : "-"}
                    </div>
                  </div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Official RoxZone</div>
                    <div className={styles.summaryValue}>
                      {officialRoxzoneSeconds != null ? formatSeconds(officialRoxzoneSeconds) : "-"}
                    </div>
                  </div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Replay RoxZone</div>
                    <div className={styles.summaryValue}>{hasReplayTotals ? formatSeconds(replayTotal) : "-"}</div>
                  </div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Difference</div>
                    <div className={[styles.summaryValue, roxzoneVarianceAcceptable ? styles.good : replayRoundingDifference === null ? "" : styles.over].filter(Boolean).join(" ")}>
                      {replayRoundingDifference != null ? formatSignedSeconds(replayRoundingDifference) : "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.summarySection} data-testid="race-replay-summary-card">
                <div className={styles.sectionHeader}>
                  <div>
                    <div className={styles.sectionTitle}>RoxZone replay</div>
                    <div className={styles.sectionSub}>Diff-column RoxZone durations</div>
                  </div>
                  <span className={replayRowsForSummary.length > 0 ? styles.statusGood : styles.statusMuted}>
                    {replayLooksLikeClockValues ? "Reimport" : replayRowsForSummary.length > 0 ? "Imported" : "Missing"}
                  </span>
                </div>
                {replayRowsForSummary.length > 0 ? (
                  <>
                    {hasReplayRoundingDifference && (
                      <div className={styles.replayNote}>
                        Small differences are expected because replay rows are rounded before summing.
                      </div>
                    )}
                    {slowestReplay && (
                      <div className={styles.calloutRow}>
                        <div className={styles.summaryLabel}>Slowest RoxZone</div>
                        <div className={styles.calloutValue}>
                          {stationLabel(slowestReplay.station)} · {formatSeconds(slowestReplay.roxzoneSeconds ?? 0)}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.detailToggle}
                      onClick={() => setShowRoxzoneDetail((value) => !value)}
                    >
                      {showRoxzoneDetail ? "Hide RoxZone detail" : "Show RoxZone detail"}
                    </button>
                    {showRoxzoneDetail && (
                      <div className={styles.detailList}>
                        <div className={[styles.detailRow, styles.detailHeader].join(" ")}>
                          <span>Station</span>
                          <span>In</span>
                          <span>Out</span>
                          <span>RoxZone</span>
                        </div>
                        {replayDisplayRows.map((item) => (
                          <div
                            key={item.station}
                            className={[styles.detailRow, item.measurable ? "" : styles.detailMuted].filter(Boolean).join(" ")}
                          >
                            <span>{stationLabel(item.station)}</span>
                            <span>{item.entrySeconds != null ? formatSeconds(item.entrySeconds) : "N/A"}</span>
                            <span>{item.exitSeconds != null ? formatSeconds(item.exitSeconds) : "N/A"}</span>
                            <span>{item.roxzoneSeconds != null ? formatSeconds(item.roxzoneSeconds) : "N/A"}</span>
                          </div>
                        ))}
                        <div className={[styles.detailRow, styles.detailTotal].join(" ")}>
                          <span>Total</span>
                          <span />
                          <span />
                          <span>{formatSeconds(replayTotal)}</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    {replayLooksLikeClockValues ? (
                      <>
                        <div>
                          This draft has old RoxZone replay clock values. Reimport the result URL to capture Diff-column RoxZone durations.
                        </div>
                        <div className={styles.emptyActions}>
                          <SecondaryButton type="button" onClick={() => void navigate("/hyrox-calculator/race-details")}>
                            Back to Import
                          </SecondaryButton>
                        </div>
                      </>
                    ) : (
                      "Use the URL import path to capture station entry and exit data."
                    )}
                  </div>
                )}
              </div>
            </FormPanel>
            <FormPanel className={styles.nextPanel}>
              <div className={styles.nextTitle}>What happens next</div>
              <p className={styles.nextCopy}>
                Screen 3 asks for training background so the report can tell the difference between a race-data limiter and a training-context limiter.
              </p>
            </FormPanel>
          </div>
        </div>
        <div className={styles.stickyCta}>
          <PrimaryButton type="button" fullWidth onClick={handleNext}>
            Continue: Add Context
          </PrimaryButton>
        </div>
      </div>
    </Shell>
  );
}
