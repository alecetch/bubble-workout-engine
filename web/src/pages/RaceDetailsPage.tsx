import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormPanel } from "../components/FormPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { Shell } from "../components/Shell";
import { SideStepper } from "../components/SideStepper";
import { SplitImportPanel } from "../components/SplitImportPanel";
import { TextInput } from "../components/TextInput";
import { TimeInput } from "../components/TimeInput";
import { findHyroxEventByName } from "../data/hyroxEvents";
import type { HyroxCalculatorDraft } from "../types";
import { fetchHyroxResultsImport, fetchHyroxSubmissionDraft, trackEvent } from "../utils/api";
import { ageGroupFromAge, normalizeAgeGroup, normalizeName, saveImportedHyroxResult } from "../utils/hyroxImportDraft";
import type { HyroxParseResult } from "../utils/hyroxResultsParser";
import { loadDraft, saveDraft } from "../utils/storage";
import {
  formatSeconds,
  isPlausibleHyroxTargetTimeSeconds,
  normalizeTimeInputValue,
  parseTimeToSeconds,
} from "../utils/time";
import styles from "./RaceDetailsPage.module.css";

type Division = "open" | "pro" | "doubles" | "relay";

const VALID_DIVISIONS: Division[] = ["open", "pro", "doubles", "relay"];
export const AGE_GROUP_OPTIONS = ["16-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70+"];
const TARGET_FINISH_TIME_PLAUSIBILITY_ERROR =
  "That doesn't look like a realistic HYROX target time. Use 1:30:00 for 1 hour 30 minutes.";
const GOAL_TIME_PLAUSIBILITY_ERROR =
  "That doesn't look like a realistic HYROX goal time. Use 1:30:00 for 1 hour 30 minutes, or leave it blank.";

function formatDivisionLabel(value: Division): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RaceDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryMode = searchParams.get("mode") as "target" | "analyse" | null;
  const restoreSubmissionId = searchParams.get("submissionId") ?? searchParams.get("submission");
  const sourceParam = searchParams.get("source");
  const submissionIdParam = searchParams.get("submissionId");
  const isEmailTargetBranch = sourceParam === "email" && !!submissionIdParam;
  const isPostAnalysisBranch = sourceParam === "analysis_complete" && !!submissionIdParam;
  const draft = loadDraft();

  const [calculatorMode, setCalculatorMode] = useState<"target" | "analyse">(
    queryMode ?? (draft?.calculatorMode as "target" | "analyse" | undefined) ?? "analyse",
  );
  const [name, setName] = useState(normalizeName(draft?.athlete?.name ?? null) ?? "");
  const [gender, setGender] = useState<"male" | "female" | "mixed">(draft?.athlete?.gender ?? "male");
  const [ageGroup, setAgeGroup] = useState(
    normalizeAgeGroup(draft?.athlete?.ageGroup) ?? ageGroupFromAge(draft?.athlete?.ageOnRaceDay) ?? "",
  );
  const [raceName, setRaceName] = useState(draft?.race?.raceName ?? "");
  const [raceDate, setRaceDate] = useState(draft?.race?.raceDate ?? "");
  const [eventCountry, setEventCountry] = useState(draft?.race?.eventCountry ?? "");
  const [division, setDivision] = useState<Division>(draft?.race?.division ?? "open");
  const [finishTime, setFinishTime] = useState(
    draft?.race?.finishTimeSeconds ? formatSeconds(draft.race.finishTimeSeconds) : "",
  );
  const [targetFinishTime, setTargetFinishTime] = useState(
    draft?.athleteContext?.targetFinishTimeSeconds ? formatSeconds(draft.athleteContext.targetFinishTimeSeconds) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [importSucceeded, setImportSucceeded] = useState(false);
  const hasDraftData = Boolean(draft?.race?.finishTimeSeconds);
  const [manualEntrySelected, setManualEntrySelected] = useState(hasDraftData);
  const showRaceFields = importSucceeded || manualEntrySelected;
  const [importTab, setImportTab] = useState<"paste" | "url">("url");
  const [importUrl, setImportUrl] = useState("");
  const [importUrlError, setImportUrlError] = useState<string | null>(null);
  const [importUrlLoading, setImportUrlLoading] = useState(false);
  const [importOpenedUrl, setImportOpenedUrl] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const parsedFinishTime = parseTimeToSeconds(finishTime);
  const parsedTargetFinishTime = parseTimeToSeconds(targetFinishTime);
  const targetTimeRequired = calculatorMode === "target";
  const isTargetFasterThanFinish = parsedFinishTime !== null && parsedTargetFinishTime !== null && parsedTargetFinishTime < parsedFinishTime;
  const targetFinishTimeIssue =
    !targetFinishTime
      ? targetTimeRequired
        ? "Enter target finish time, e.g. 55:00 or 1:05:00"
        : undefined
      : parsedTargetFinishTime === null
        ? targetTimeRequired
          ? "Enter target finish time as MM:SS or H:MM:SS, e.g. 55:00 or 1:05:00."
          : "Enter goal time as MM:SS or H:MM:SS, e.g. 55:00, or leave it blank."
        : !isPlausibleHyroxTargetTimeSeconds(parsedTargetFinishTime)
          ? targetTimeRequired
            ? TARGET_FINISH_TIME_PLAUSIBILITY_ERROR
            : GOAL_TIME_PLAUSIBILITY_ERROR
        : parsedFinishTime !== null && !isTargetFasterThanFinish
          ? targetTimeRequired
            ? "Target time must be faster than your current finish time."
            : "Goal time must be faster than your finish time."
          : undefined;
  const isFormValid =
    calculatorMode === "analyse"
      ? Boolean(ageGroup && parsedFinishTime !== null && !targetFinishTimeIssue)
      : Boolean(ageGroup && parsedFinishTime !== null && parsedTargetFinishTime !== null && !targetFinishTimeIssue);
  const targetFinishTimeInlineIssue = targetFinishTime ? targetFinishTimeIssue : undefined;
  const isTargetMode = calculatorMode === "target";
  const benefits: [string, string][] = isTargetMode
    ? [
        ["Gap analysis", "Where time is being lost versus your target."],
        ["Priority stations", "What's blocking you from hitting your goal."],
        ["Training focus", "Matched to your target time and current splits."],
      ]
    : [
        ["Benchmark", "See how your race compares with athletes at your level."],
        ["Bottleneck", "Find the runs, stations or transitions costing you time."],
        ["Training focus", "Know what to prioritise before your next block."],
      ];
  const importedSummary = [name, division ? formatDivisionLabel(division) : "", finishTime].filter(Boolean).join(" · ");

  useEffect(() => {
    trackEvent("hyrox_calculator_started");
  }, []);

  useEffect(() => {
    if (isEmailTargetBranch) {
      saveDraft({
        meta: {
          source: "analysis_email",
          sourceSubmissionId: submissionIdParam ?? undefined,
        },
      });
      trackEvent("analysis_email_target_clicked", {
        source: "analysis_email",
        sourceSubmissionId: submissionIdParam,
        mode: "target",
      });
    }

    if (isPostAnalysisBranch) {
      saveDraft({
        meta: {
          source: "analysis_complete",
          sourceSubmissionId: submissionIdParam ?? undefined,
        },
      });
      trackEvent("target_started_from_analysis_complete", {
        source: "analysis_complete",
        sourceSubmissionId: submissionIdParam,
        journeyVariant: "target-post-analysis",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restoreSubmissionId) return;
    let cancelled = false;
    setRestoreMessage("Restoring your HYROX result...");
    fetchHyroxSubmissionDraft(restoreSubmissionId)
      .then(({ draft: restored }) => {
        if (cancelled) return;
        const restoredMode = queryMode ?? restored.calculatorMode ?? "target";
        saveDraft({
          ...restored,
          calculatorMode: restoredMode,
          ...(isEmailTargetBranch || isPostAnalysisBranch
            ? {
                meta: {
                  ...(restored.meta ?? {}),
                  source: isPostAnalysisBranch ? "analysis_complete" : "analysis_email",
                  sourceSubmissionId: submissionIdParam ?? undefined,
                },
              }
            : {}),
        });
        setCalculatorMode(restoredMode);
        setName(normalizeName(restored.athlete?.name ?? null) ?? "");
        setGender(restored.athlete?.gender ?? "male");
        setAgeGroup(
          normalizeAgeGroup(restored.athlete?.ageGroup) ?? ageGroupFromAge(restored.athlete?.ageOnRaceDay) ?? "",
        );
        setRaceName(restored.race?.raceName ?? "");
        setRaceDate(restored.race?.raceDate ?? "");
        setEventCountry(restored.race?.eventCountry ?? findHyroxEventByName(restored.race?.raceName ?? "")?.country ?? "");
        setDivision(restored.race?.division ?? "open");
        setFinishTime(restored.race?.finishTimeSeconds ? formatSeconds(restored.race.finishTimeSeconds) : "");
        setTargetFinishTime(
          restored.athleteContext?.targetFinishTimeSeconds
            ? formatSeconds(restored.athleteContext.targetFinishTimeSeconds)
            : "",
        );
        setImportSucceeded(true);
        setRestoreMessage(
          isPostAnalysisBranch
            ? "Your race data from this analysis has been loaded. Add your target time to continue."
            : "Your previous HYROX result has been restored.",
        );
      })
      .catch(() => {
        if (!cancelled) setRestoreMessage("We couldn't restore your previous result. You can still paste your HYROX URL or enter it manually.");
      });
    return () => {
      cancelled = true;
    };
  }, [isEmailTargetBranch, isPostAnalysisBranch, queryMode, restoreSubmissionId, submissionIdParam]);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!ageGroup) {
      errs.ageGroup = "Select your age group.";
    }

    const parsedFinish = parseTimeToSeconds(finishTime);
    if (!finishTime || parsedFinish === null) {
      errs.finishTime = "Enter finish time, e.g. 1:25:17 or 85:17";
    }

    if (targetTimeRequired) {
      const parsedTarget = parseTimeToSeconds(targetFinishTime);
      if (!targetFinishTime || parsedTarget === null) {
        errs.targetFinishTime = "Enter target finish time as MM:SS or H:MM:SS, e.g. 55:00 or 1:05:00.";
      } else if (!isPlausibleHyroxTargetTimeSeconds(parsedTarget)) {
        errs.targetFinishTime = TARGET_FINISH_TIME_PLAUSIBILITY_ERROR;
      } else if (parsedFinish !== null && parsedTarget >= parsedFinish) {
        errs.targetFinishTime = "Target time must be faster than your current finish time.";
      }
    } else if (targetFinishTime) {
      const parsedTarget = parseTimeToSeconds(targetFinishTime);
      if (parsedTarget === null) {
        errs.targetFinishTime = "Enter goal time as MM:SS or H:MM:SS, e.g. 55:00, or leave it blank.";
      } else if (!isPlausibleHyroxTargetTimeSeconds(parsedTarget)) {
        errs.targetFinishTime = GOAL_TIME_PLAUSIBILITY_ERROR;
      } else if (parsedFinish !== null && parsedTarget >= parsedFinish) {
        errs.targetFinishTime = "Goal time must be faster than your finish time.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function applyImportedResult(result: HyroxParseResult) {
    const normalizedName = normalizeName(result.athleteName);
    if (normalizedName) setName(normalizedName);
    const importedAgeGroup = normalizeAgeGroup(result.ageGroup) ?? ageGroupFromAge(result.athleteAge);
    if (importedAgeGroup) setAgeGroup(importedAgeGroup);
    if (result.raceName) {
      setRaceName(result.raceName);
      const knownEvent = findHyroxEventByName(result.raceName);
      if (knownEvent) {
        setRaceDate(knownEvent.startDate);
        setEventCountry(knownEvent.country ?? "");
      }
    }
    if (result.division && VALID_DIVISIONS.includes(result.division)) {
      setDivision(result.division);
    }
    if (result.divisionSex === "mixed") {
      setGender("mixed");
      setDivision("doubles");
    }
    if (result.finishTimeSeconds && result.finishTimeSeconds > 0) {
      setFinishTime(formatSeconds(result.finishTimeSeconds));
    }
  }

  function handleInlineImport(result: HyroxParseResult) {
    saveImportedHyroxResult(result);
    applyImportedResult(result);
    setImportSucceeded(true);
    setErrors({});
    setImportUrlError(null);
  }

  async function handleUrlFetch() {
    setImportUrlError(null);
    if (!importUrl.startsWith("https://results.hyrox.com/")) {
      setImportUrlError("We could not import that result. Check the URL or enter the details manually.");
      return;
    }

    setImportUrlLoading(true);
    const response: Awaited<ReturnType<typeof fetchHyroxResultsImport>> = await fetchHyroxResultsImport(importUrl).catch(() => ({
      success: false,
      reason: "fetch_failed",
    }));
    setImportUrlLoading(false);

    if (response.success && response.parsed && response.parsed.confidence !== "low") {
      handleInlineImport(response.parsed);
      if (response.eventDate) {
        setRaceDate(response.eventDate);
      }
      const det = response.divisionDetection;
      if (det?.divisionSex === "mixed") {
        setGender("mixed");
        setDivision("doubles");
      } else if (det?.divisionSex === "female") {
        setGender("female");
      } else if (det?.divisionSex === "male") {
        setGender("male");
      }
      return;
    }

    setImportUrlError("We could not import that result. Check the URL or enter the details manually.");
    window.open(importUrl, "_blank", "noopener");
    setImportOpenedUrl(importUrl);
    setImportTab("paste");
  }

  function handleNext() {
    if (!validate()) return;
    if (!isFormValid) return;

    const finishSeconds = parseTimeToSeconds(finishTime) ?? 0;
    const parsedTarget = parseTimeToSeconds(targetFinishTime);
    const targetFinishTimeSeconds = parsedTarget !== null && parsedTarget < finishSeconds ? parsedTarget : undefined;
    const updated: Partial<HyroxCalculatorDraft> = {
      calculatorMode,
      athlete: {
        name: normalizeName(name) ?? undefined,
        gender,
        ageGroup,
      },
      race: {
	        raceName: raceName.trim() || undefined,
	        raceDate: raceDate || undefined,
	        eventCountry: eventCountry || findHyroxEventByName(raceName.trim())?.country || undefined,
	        division,
        finishTimeSeconds: finishSeconds,
      },
      athleteContext: {
        ...(draft?.athleteContext ?? {}),
        targetFinishTimeSeconds,
      },
    };
    saveDraft(updated);
    trackEvent("race_details_completed");
    void navigate("/hyrox-calculator/splits");
  }

  function applyKnownEventDateFromName(value: string) {
    const event = findHyroxEventByName(value);
    if (!event) return;
    if (!raceDate) setRaceDate(event.startDate);
    if (!eventCountry) setEventCountry(event.country ?? "");
  }

  return (
    <Shell>
      <SideStepper current={1} />
      <div className={styles.layout}>
        <div className={styles.pitchCol}>
          <div className={styles.eyebrow}>
            {isTargetMode ? "HIT A TARGET TIME" : "ANALYSE MY RACE"}
          </div>
          <h1 className={styles.headline}>
            {isTargetMode ? "Hit a target time" : "Analyse your HYROX result"}
          </h1>
          <p className={styles.subline}>
            {isTargetMode
              ? "Start with your latest HYROX result. Forma will use your splits as the baseline, then show what needs to change to reach your goal."
              : "Paste your result URL and Forma will benchmark your race, find the biggest time gaps, and show what to train next."}
          </p>
          <ul className={styles.benefits}>
            {benefits.map(([title, body]) => (
              <li key={title} className={styles.benefit}>
                <span className={styles.benefitIcon}>&#10003;</span>
                <span>
                  <strong>{title}</strong>
                  {body}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.linkStack}>
            {!isTargetMode && (
              <Link to="/hyrox-calculator/sample-report" className={styles.externalLink}>
                View Sample Report -&gt;
              </Link>
            )}
            <a
              href="https://results.hyrox.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              Need your results? Visit results.hyrox.com
            </a>
          </div>
        </div>

        <div className={styles.formCol}>
          <FormPanel className={styles.racePanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.formTitle}>
                {calculatorMode === "target" ? "Hit a target time" : "Analyse your race"}
              </h2>
              <p className={styles.formIntro}>
                {calculatorMode === "target"
                  ? "Paste your HYROX result URL and Forma will use your splits as your baseline."
                  : "Paste your HYROX result URL and Forma will benchmark your race."}
              </p>
            </div>
            {restoreMessage && (
              <div data-testid="submission-restore-message" className={restoreMessage.startsWith("We couldn't") ? styles.importWarning : styles.importSuccess}>
                <div className={styles.successTitle}>{restoreMessage}</div>
              </div>
            )}

            <div className={styles.fields}>
              <div data-testid="inline-import-panel">
                {importSucceeded && (
                  <div data-testid="import-success-badge" className={styles.importSuccess}>
                    <div className={styles.successTitle}>✓ Result imported</div>
                    <div className={styles.successMeta}>{importedSummary || "Fields pre-filled below"}</div>
                  </div>
                )}

                {importTab === "paste" && (
                  <>
                    {importOpenedUrl && !importSucceeded && (
                      <div className={styles.importWarning}>
                        <strong>Your results page is open in a new tab.</strong>
                        <span> Copy the page text that includes <strong>WORKOUT SUMMARY</strong> and, if shown, <strong>RACE REPLAY</strong>, then paste it below.</span>
                      </div>
                    )}
                    <SplitImportPanel onImport={handleInlineImport} onCancel={() => undefined} />
                  </>
                )}

                {importTab === "url" && !importSucceeded && (
                  <div className={styles.urlImport}>
                    <label className={styles.urlLabel} htmlFor="hyrox-result-url">
                      HYROX result URL
                    </label>
                    <input
                      id="hyrox-result-url"
                      data-testid="inline-url-input"
                      type="url"
                      placeholder="https://results.hyrox.com/..."
                      value={importUrl}
                      onChange={(event) => setImportUrl(event.target.value)}
                      disabled={importUrlLoading}
                      className={styles.urlInput}
                    />
                    {importUrlError && (
                      <div data-testid="inline-url-error" className={styles.importError}>
                        {importUrlError}
                      </div>
                    )}
                    <div className={styles.importAction}>
                      <SecondaryButton
                        type="button"
                        data-testid="inline-url-fetch"
                        disabled={importUrlLoading}
                        onClick={() => void handleUrlFetch()}
                      >
                        {importUrlLoading ? "Importing result..." : "Import result"}
                      </SecondaryButton>
                    </div>
                    <button
                      type="button"
                      className={styles.pasteLink}
                      onClick={() => setImportTab("paste")}
                    >
                      Paste results text instead →
                    </button>
                  </div>
                )}
              </div>

              {!showRaceFields && (
                <p className={styles.formReassurance}>
                  Your report includes benchmark gaps, priority stations and training focus.
                </p>
              )}

              {!importSucceeded && !manualEntrySelected && (
                <button
                  type="button"
                  data-testid="manual-entry-separator"
                  className={styles.manualEntryLink}
                  onClick={() => {
                    setManualEntrySelected(true);
                    trackEvent("manual_entry_expanded", { mode: calculatorMode });
                  }}
                >
                  Or enter manually
                </button>
              )}

              {showRaceFields && (
                <>
                  <div className={styles.fieldGroup}>
                    <div className={styles.groupTitle}>
                      {calculatorMode === "target"
                        ? "Confirm your race details and target"
                        : "Confirm your race details"}
                    </div>
                    <div className={styles.row2}>
                      <SegmentedControl
                        label="Gender"
                        required
                        options={[
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                          { value: "mixed", label: "Mixed" },
                        ]}
                        value={gender}
                        onChange={(v) => {
                          const g = v as "male" | "female" | "mixed";
                          setGender(g);
                          if (g === "mixed") setDivision("doubles");
                        }}
                      />
                      <div className={styles.selectField}>
                        <label htmlFor="age-group" className={styles.selectLabel}>
                          Age Group <span className={styles.required}>*</span>
                        </label>
                        <select
                          id="age-group"
                          value={ageGroup}
                          onChange={(event) => setAgeGroup(event.target.value)}
                          className={`${styles.select} ${errors.ageGroup ? styles.selectError : ""}`}
                        >
                          <option value="">Select range</option>
                          {AGE_GROUP_OPTIONS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                        {errors.ageGroup && <div className={styles.errorMsg}>{errors.ageGroup}</div>}
                      </div>
                    </div>
                    <SegmentedControl
                      label="Division"
                      required
                      options={[
                        { value: "open", label: "Open" },
                        { value: "pro", label: "Pro" },
                        { value: "doubles", label: "Doubles" },
                        { value: "relay", label: "Relay" },
                      ]}
                      value={division}
                      onChange={(v) => setDivision(v as Division)}
                    />
                    <div className={styles.benchmarkNote}>
                      Benchmark: your age group, gender and division set the comparison group.
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <div className={styles.groupTitle}>Result</div>
                    <div className={styles.row2}>
                      <TimeInput
                        label="Finish Time"
                        required
                        placeholder="1:25:17 or 85:17"
                        hint="Your official race finish time."
                        value={finishTime}
                        onChange={(e) => setFinishTime(e.target.value)}
                        onBlur={(e) => setFinishTime(normalizeTimeInputValue(e.target.value))}
                        error={errors.finishTime}
                      />
                      <TimeInput
                        label={targetTimeRequired ? "Target finish time" : "Goal time (optional)"}
                        required={targetTimeRequired}
                        placeholder="55:00 or 5500"
                        hint={targetTimeRequired ? "Type 5500 for 55:00. This must be faster than your finish time." : "Optional. Type 5500 for 55:00; leave blank if you do not have a goal."}
                        value={targetFinishTime}
                        onChange={(e) => setTargetFinishTime(e.target.value)}
                        onBlur={(e) => setTargetFinishTime(normalizeTimeInputValue(e.target.value))}
                        error={errors.targetFinishTime || targetFinishTimeInlineIssue}
                      />
                    </div>
                    <TextInput
                      label="Athlete Name"
                      placeholder="Optional"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={(e) => {
                        const normalized = normalizeName(e.target.value);
                        if (normalized) setName(normalized);
                      }}
                    />
                    <div className={styles.row2}>
                      <TextInput
                        label="Race Name"
                        placeholder="e.g. HYROX Manchester"
                        value={raceName}
                        onChange={(e) => setRaceName(e.target.value)}
                        onBlur={(e) => applyKnownEventDateFromName(e.target.value)}
                      />
                      <TextInput
                        label="Race Date"
                        type="date"
                        value={raceDate}
                        onChange={(e) => setRaceDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <PrimaryButton type="button" fullWidth onClick={handleNext} disabled={!isFormValid}>
                      Next: Check Splits
                    </PrimaryButton>
                    <p className={styles.ctaReassurance}>No account needed. Email capture happens at review.</p>
                  </div>
                </>
              )}
            </div>
          </FormPanel>

        </div>
      </div>

      {showRaceFields && (
        <div data-testid="mobile-sticky-cta" className={styles.mobileStickyCta}>
          <PrimaryButton type="button" fullWidth onClick={handleNext} disabled={!isFormValid}>
            Next: Check Splits
          </PrimaryButton>
        </div>
      )}
    </Shell>
  );
}
