import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { TextInput } from "../components/TextInput";
import { SegmentedControl } from "../components/SegmentedControl";
import { TimeInput } from "../components/TimeInput";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { SplitImportPanel } from "../components/SplitImportPanel";
import { loadDraft, saveDraft } from "../utils/storage";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { fetchHyroxResultsImport, trackEvent } from "../utils/api";
import { normalizeName, saveImportedHyroxResult } from "../utils/hyroxImportDraft";
import type { HyroxCalculatorDraft } from "../types";
import type { HyroxParseResult } from "../utils/hyroxResultsParser";
import styles from "./RaceDetailsPage.module.css";

type Division = "open" | "pro" | "doubles" | "relay";

const VALID_DIVISIONS: Division[] = ["open", "pro", "doubles", "relay"];

export function RaceDetailsPage() {
  const navigate = useNavigate();
  const draft = loadDraft();

  const [name, setName] = useState(normalizeName(draft?.athlete?.name ?? null) ?? "");
  const [gender, setGender] = useState<"male" | "female">(
    draft?.athlete?.gender ?? "male",
  );
  const [age, setAge] = useState(
    draft?.athlete?.ageOnRaceDay ? String(draft.athlete.ageOnRaceDay) : "",
  );
  const [raceName, setRaceName] = useState(draft?.race?.raceName ?? "");
  const [raceDate, setRaceDate] = useState(draft?.race?.raceDate ?? "");
  const [division, setDivision] = useState<Division>(draft?.race?.division ?? "open");
  const [finishTime, setFinishTime] = useState(
    draft?.race?.finishTimeSeconds
      ? formatSeconds(draft.race.finishTimeSeconds)
      : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [importSucceeded, setImportSucceeded] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "url">("paste");
  const [importUrl, setImportUrl] = useState("");
  const [importUrlError, setImportUrlError] = useState<string | null>(null);
  const [importUrlLoading, setImportUrlLoading] = useState(false);
  const [importOpenedUrl, setImportOpenedUrl] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("hyrox_calculator_started");
  }, []);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 16 || ageNum > 80) {
      errs.age = "Enter your age (16–80).";
    }

    const parsedFinish = parseTimeToSeconds(finishTime);
    if (!finishTime || parsedFinish === null) {
      errs.finishTime = "Enter finish time, e.g. 1:25:17 or 85:17";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function applyImportedResult(result: HyroxParseResult) {
    const normalizedName = normalizeName(result.athleteName);
    if (normalizedName) setName(normalizedName);
    if (result.raceName) setRaceName(result.raceName);
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
      setImportUrlError("Enter a valid results.hyrox.com URL.");
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
      return;
    }

    window.open(importUrl, "_blank", "noopener");
    setImportOpenedUrl(importUrl);
    setImportTab("paste");
  }

  function handleNext() {
    if (!validate()) return;

    const finishSeconds = parseTimeToSeconds(finishTime) ?? 0;
    const updated: Partial<HyroxCalculatorDraft> = {
      athlete: {
        name: normalizeName(name) ?? undefined,
        gender,
        ageOnRaceDay: parseInt(age, 10),
      },
      race: {
        raceName: raceName.trim() || undefined,
        raceDate: raceDate || undefined,
        division,
        finishTimeSeconds: finishSeconds,
      },
    };
    saveDraft(updated);
    trackEvent("race_details_completed");
    void navigate("/hyrox-calculator/splits");
  }

  return (
    <Shell>
      <div className={styles.layout}>
        {/* Left pitch column */}
        <div className={styles.pitchCol}>
          <div className={styles.eyebrow}>Forma — Performance Engineer</div>
          <h1 className={styles.headline}>
            Data in.
            <br />
            Insight out.
            <br />
            Performance up.
          </h1>
          <p className={styles.subline}>
            Enter your HYROX race result and get a personalised performance
            analysis delivered to your inbox — free.
          </p>
          <ul className={styles.bullets}>
            {[
              "Identify your biggest time limiter across 16 segments",
              "Benchmark against athletes in your age group and division",
              "Get a clear training focus for your next event",
              "Understand your run/work balance and roxzone",
            ].map((b) => (
              <li key={b} className={styles.bullet}>
                <span className={styles.bulletIcon}>→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Link
              to="/hyrox-calculator/sample-report"
              className={styles.externalLink}
            >
              View Sample Report →
            </Link>
            <a
              href="https://results.hyrox.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              Need your results? Visit results.hyrox.com ↗
            </a>
          </div>
        </div>

        {/* Right form column */}
        <div className={styles.formCol}>
          <FormPanel>
            <h2 className={styles.formTitle}>Your Race Details</h2>
            <div className={styles.fields}>
              <div data-testid="inline-import-panel">
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <SecondaryButton type="button" onClick={() => setImportTab("paste")}>
                    Paste
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => setImportTab("url")}>
                    URL
                  </SecondaryButton>
                </div>

                {importSucceeded && (
                  <div
                    data-testid="import-success-badge"
                    style={{
                      marginBottom: 16,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(34,197,94,0.45)",
                      background: "rgba(34,197,94,0.12)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Imported from results.hyrox.com - fields pre-filled below
                  </div>
                )}

                {importTab === "paste" && (
                  <>
                    {importOpenedUrl && !importSucceeded && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: "12px 16px",
                          borderRadius: 8,
                          background: "rgba(245,158,11,0.12)",
                          border: "1px solid rgba(245,158,11,0.45)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <strong style={{ color: "var(--text-primary)" }}>Your results page is open in a new tab.</strong>
                        <span> Press <kbd>Ctrl+A</kbd> to select all, <kbd>Ctrl+C</kbd> to copy, then paste below.</span>
                      </div>
                    )}
                    <SplitImportPanel onImport={handleInlineImport} onCancel={() => undefined} />
                  </>
                )}

                {importTab === "url" && !importSucceeded && (
                  <div>
                    <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: 8 }}>
                      Paste a link to your results page and we'll try to import automatically.
                    </label>
                    <input
                      data-testid="inline-url-input"
                      type="url"
                      placeholder="https://results.hyrox.com/season-8/?..."
                      value={importUrl}
                      onChange={(event) => setImportUrl(event.target.value)}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-950)",
                        color: "var(--text-primary)",
                      }}
                    />
                    {importUrlError && (
                      <div data-testid="inline-url-error" style={{ color: "var(--accent-red)", marginTop: 8 }}>
                        {importUrlError}
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <PrimaryButton
                        type="button"
                        data-testid="inline-url-fetch"
                        loading={importUrlLoading}
                        onClick={() => void handleUrlFetch()}
                      >
                        Fetch Results
                      </PrimaryButton>
                    </div>
                  </div>
                )}
              </div>

              {!importSucceeded && (
                <div
                  data-testid="manual-entry-separator"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    padding: "4px 0 2px",
                  }}
                >
                  - Or enter manually below -
                </div>
              )}

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
                <TextInput
                  label="Age on Race Day"
                  type="number"
                  required
                  placeholder="e.g. 35"
                  min={16}
                  max={80}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  error={errors.age}
                />
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
                onChange={(v) =>
                  setDivision(v as Division)
                }
              />
              <TimeInput
                label="Finish Time"
                required
                placeholder="1:25:17 or 85:17"
                hint="HH:MM:SS or MM:SS (e.g. 85:17 for 1h 25m 17s)"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                error={errors.finishTime}
              />
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
              <TextInput
                label="Race Name"
                placeholder="e.g. HYROX Manchester"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
              />
              <TextInput
                label="Race Date"
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
              />

              <div className={styles.actions}>
                <PrimaryButton type="button" fullWidth onClick={handleNext}>
                  Next: Enter Your Splits →
                </PrimaryButton>
              </div>
            </div>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
