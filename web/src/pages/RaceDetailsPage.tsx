import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { fetchHyroxResultsImport, trackEvent } from "../utils/api";
import { ageGroupFromAge, normalizeAgeGroup, normalizeName, saveImportedHyroxResult } from "../utils/hyroxImportDraft";
import type { HyroxParseResult } from "../utils/hyroxResultsParser";
import { loadDraft, saveDraft } from "../utils/storage";
import { formatSeconds, normalizeTimeInputValue, parseTimeToSeconds } from "../utils/time";
import styles from "./RaceDetailsPage.module.css";

type Division = "open" | "pro" | "doubles" | "relay";

const VALID_DIVISIONS: Division[] = ["open", "pro", "doubles", "relay"];
const AGE_GROUP_OPTIONS = ["18-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69"];

function formatDivisionLabel(value: Division): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RaceDetailsPage() {
  const navigate = useNavigate();
  const draft = loadDraft();

  const [calculatorMode, setCalculatorMode] = useState<"target" | "analyse">(
    (draft?.calculatorMode as "target" | "analyse" | undefined) ?? "target",
  );
  const [name, setName] = useState(normalizeName(draft?.athlete?.name ?? null) ?? "");
  const [gender, setGender] = useState<"male" | "female">(draft?.athlete?.gender ?? "male");
  const [ageGroup, setAgeGroup] = useState(
    normalizeAgeGroup(draft?.athlete?.ageGroup) ?? ageGroupFromAge(draft?.athlete?.ageOnRaceDay) ?? "",
  );
  const [raceName, setRaceName] = useState(draft?.race?.raceName ?? "");
  const [raceDate, setRaceDate] = useState(draft?.race?.raceDate ?? "");
  const [division, setDivision] = useState<Division>(draft?.race?.division ?? "open");
  const [finishTime, setFinishTime] = useState(
    draft?.race?.finishTimeSeconds ? formatSeconds(draft.race.finishTimeSeconds) : "",
  );
  const [targetFinishTime, setTargetFinishTime] = useState(
    draft?.athleteContext?.targetFinishTimeSeconds ? formatSeconds(draft.athleteContext.targetFinishTimeSeconds) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [importSucceeded, setImportSucceeded] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "url">("url");
  const [importUrl, setImportUrl] = useState("");
  const [importUrlError, setImportUrlError] = useState<string | null>(null);
  const [importUrlLoading, setImportUrlLoading] = useState(false);
  const [importOpenedUrl, setImportOpenedUrl] = useState<string | null>(null);

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
  const importedSummary = [name, division ? formatDivisionLabel(division) : "", finishTime].filter(Boolean).join(" · ");

  useEffect(() => {
    trackEvent("hyrox_calculator_started");
  }, []);

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
      } else if (parsedFinish !== null && parsedTarget >= parsedFinish) {
        errs.targetFinishTime = "Target time must be faster than your current finish time.";
      }
    } else if (targetFinishTime) {
      const parsedTarget = parseTimeToSeconds(targetFinishTime);
      if (parsedTarget === null) {
        errs.targetFinishTime = "Enter goal time as MM:SS or H:MM:SS, e.g. 55:00, or leave it blank.";
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
      }
    }
    if (result.division && VALID_DIVISIONS.includes(result.division)) {
      setDivision(result.division);
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
  }

  return (
    <Shell>
      <SideStepper current={1} />
      <div className={styles.layout}>
        <div className={styles.pitchCol}>
          <div className={styles.eyebrow}>FREE HYROX ANALYSIS</div>
          <h1 className={styles.headline}>
            Data in.
            <br />
            Insight out.
            <br />
            Per<span style={{ WebkitTextFillColor: "var(--accent-cyan)" }}>forma</span>nce up.
          </h1>
          <p className={styles.subline}>
            Paste your HYROX result and Forma turns your race into a clear
            benchmarked analysis: where you lost time, what you did well, and
            what to train next.
          </p>
          <ul className={styles.benefits}>
            {[
              ["Benchmark", "Compare your race with a relevant target group."],
              ["Bottleneck", "Find the stations, runs or transitions costing the most."],
              ["Training direction", "Get a practical focus before your next block."],
            ].map(([title, body]) => (
              <li key={title} className={styles.benefit}>
                <span className={styles.benefitIcon}>✓</span>
                <span>
                  <strong>{title}</strong>
                  {body}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.linkStack}>
            <Link to="/hyrox-calculator/sample-report" className={styles.externalLink}>
              View Sample Report -&gt;
            </Link>
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
              <h2 className={styles.formTitle}>Race details</h2>
              <p className={styles.formIntro}>Paste your HYROX result URL or enter your race manually.</p>
            </div>

            <div className={styles.fields}>
              <div data-testid="inline-import-panel">
                <div className={styles.importTabs}>
                  <button
                    type="button"
                    className={`${styles.importTab} ${importTab === "url" ? styles.importTabActive : ""}`}
                    onClick={() => setImportTab("url")}
                    disabled={importUrlLoading}
                  >
                    Import URL
                  </button>
                  <button
                    type="button"
                    className={`${styles.importTab} ${importTab === "paste" ? styles.importTabActive : ""}`}
                    onClick={() => setImportTab("paste")}
                    disabled={importUrlLoading}
                  >
                    Manual
                  </button>
                </div>

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
                  </div>
                )}
              </div>

              {!importSucceeded && (
                <div data-testid="manual-entry-separator" className={styles.manualSeparator}>
                  Or enter manually below
                </div>
              )}

              <div className={styles.fieldGroup}>
                <div className={styles.groupTitle}>Race setup</div>
                <SegmentedControl
                  label="What do you want to know?"
                  options={[
                    { value: "target", label: "Hit a target time" },
                    { value: "analyse", label: "Analyse my race" },
                  ]}
                  value={calculatorMode}
                  onChange={(v) => {
                    const mode = v as "target" | "analyse";
                    setCalculatorMode(mode);
                    saveDraft({ calculatorMode: mode });
                  }}
                />
                <div className={styles.row2}>
                  <SegmentedControl
                    label="Gender"
                    required
                    options={[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                    ]}
                    value={gender}
                    onChange={(v) => setGender(v as "male" | "female")}
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
            </div>
          </FormPanel>

          <FormPanel className={styles.previewPanel}>
            <div className={styles.previewEyebrow}>WHAT YOU&apos;LL GET</div>
            <h2 className={styles.previewTitle}>A race report that tells you what to train next.</h2>
            <div className={styles.previewRows}>
              <PreviewRow label="Benchmark comparison" value="Calculated after submit" />
              <PreviewRow label="Time gaps" value="Based on your splits" />
              <PreviewRow label="Training focus" value="Matched to the final report" />
            </div>
          </FormPanel>
        </div>
      </div>

      <div className={styles.mobileStickyCta}>
        <PrimaryButton type="button" fullWidth onClick={handleNext} disabled={!isFormValid}>
          Next: Check Splits
        </PrimaryButton>
      </div>
    </Shell>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.previewRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
