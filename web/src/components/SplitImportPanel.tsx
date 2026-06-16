import { useState } from "react";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { formatSeconds } from "../utils/time";
import { parseHyroxResults, type HyroxParseResult } from "../utils/hyroxResultsParser";

interface SplitImportPanelProps {
  onImport: (result: HyroxParseResult) => void;
  onCancel?: () => void;
}

const panelStyle = {
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  padding: 20,
  background: "var(--panel-900)",
} as const;

const HYROX_RESULTS_URL = "https://results.hyrox.com/";

export function SplitImportPanel({ onImport, onCancel }: SplitImportPanelProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<HyroxParseResult | null>(null);
  const [state, setState] = useState<"idle" | "url" | "error" | "warning" | "confirm">("idle");

  function parse() {
    if (text.trim().startsWith(HYROX_RESULTS_URL)) {
      setState("url");
      return;
    }
    const parsed = parseHyroxResults(text);
    setResult(parsed);
    if (!parsed.success || parsed.confidence === "low") setState("error");
    else if (parsed.confidence === "partial") setState("warning");
    else setState("confirm");
  }

  function confirm() {
    if (result) onImport(result);
  }

  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Import your results</h2>
      <p style={{ color: "var(--text-secondary)" }}>
        Open your results on results.hyrox.com, press <kbd>Ctrl+A</kbd> to select all, then copy and paste below.
      </p>
      <textarea
        data-testid="paste-area"
        placeholder="Paste your results page content here (not the URL)..."
        value={text}
        onChange={(event) => setText(event.target.value)}
        style={{
          width: "100%",
          minHeight: 240,
          resize: "vertical",
          borderRadius: 8,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-950)",
          color: "var(--text-primary)",
          padding: 12,
          font: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <PrimaryButton type="button" data-testid="parse-btn" onClick={parse}>
          Parse Results
        </PrimaryButton>
        {onCancel && (
          <SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </SecondaryButton>
        )}
      </div>

      {state === "url" && (
        <div data-testid="parse-url-hint" style={{ marginTop: 16, color: "var(--accent-amber)" }}>
          <strong style={{ display: "block", marginBottom: 6 }}>That looks like a results URL, not the page content.</strong>
          To import your splits:
          <ol style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: 1.8 }}>
            <li>Open the link in your browser</li>
            <li>Press <kbd>Ctrl+A</kbd> (or <kbd>Cmd+A</kbd>) to select all</li>
            <li>Copy (<kbd>Ctrl+C</kbd>)</li>
            <li>Paste the copied text here instead</li>
          </ol>
        </div>
      )}

      {state === "error" && (
        <div data-testid="parse-error" style={{ marginTop: 16, color: "var(--accent-red)" }}>
          We couldn't read your splits. Try copying more of the page, including the splits table.
        </div>
      )}

      {state === "warning" && result && (
        <div data-testid="parse-warning" style={{ marginTop: 16, color: "var(--accent-amber)" }}>
          Found {result.splits.length} splits. Missing splits will be blank.
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <PrimaryButton type="button" onClick={() => setState("confirm")}>
              Continue anyway
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setState("idle")}>
              Try again
            </SecondaryButton>
          </div>
        </div>
      )}

      {state === "confirm" && result && (
        <div data-testid="parse-confirm" style={{ marginTop: 16, color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>Import summary</strong>
          <div>Athlete: {result.athleteName ?? "Not found"}</div>
          <div>Finish time: {result.finishTimeSeconds ? formatSeconds(result.finishTimeSeconds, "HH:MM:SS") : "Not found"}</div>
          <div>Splits: {result.splits.length} / 16</div>
          <div>Penalties: {result.penalties.length ? result.penalties.map((p) => `${p.segmentKey} ${p.penaltySeconds}s`).join(", ") : "None"}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <PrimaryButton type="button" data-testid="confirm-btn" onClick={confirm}>
              Looks right? Continue →
            </PrimaryButton>
            <SecondaryButton type="button" onClick={onCancel}>
              Edit manually
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
