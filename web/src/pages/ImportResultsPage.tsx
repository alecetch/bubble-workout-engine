import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { SideStepper } from "../components/SideStepper";
import { SplitImportPanel } from "../components/SplitImportPanel";
import { PrimaryButton } from "../components/PrimaryButton";
import { SecondaryButton } from "../components/SecondaryButton";
import { fetchHyroxResultsImport } from "../utils/api";
import { nextRouteAfterImport, saveImportedHyroxResult } from "../utils/hyroxImportDraft";
import type { HyroxParseResult } from "../utils/hyroxResultsParser";

export function ImportResultsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"paste" | "url">("paste");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<HyroxParseResult | null>(null);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);

  function handleImport(result: HyroxParseResult) {
    const draft = saveImportedHyroxResult(result);
    void navigate(nextRouteAfterImport(draft));
  }

  async function handleFetch() {
    setUrlError(null);
    setUrlResult(null);
    if (!url.startsWith("https://results.hyrox.com/")) {
      setUrlError("Enter a valid results.hyrox.com URL.");
      return;
    }
    setLoading(true);
    const response: Awaited<ReturnType<typeof fetchHyroxResultsImport>> = await fetchHyroxResultsImport(url).catch(() => ({ success: false, reason: "fetch_failed" }));
    setLoading(false);
    if (response.success && response.parsed && response.parsed.confidence !== "low") {
      setUrlResult(response.parsed);
    } else {
      // Can't read the page server-side — open it in a new tab and guide the user to paste
      window.open(url, "_blank", "noopener");
      setOpenedUrl(url);
      setTab("paste");
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 0" }}>
        <SideStepper current={1} />
        <FormPanel>
          <p style={{ color: "var(--text-secondary)", marginBottom: 16, marginTop: 0 }}>
            Paste your results below, then complete the remaining details on the next screen.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <SecondaryButton type="button" onClick={() => setTab("paste")}>Paste</SecondaryButton>
            <SecondaryButton type="button" onClick={() => setTab("url")}>URL</SecondaryButton>
          </div>
          {tab === "paste" ? (
            <>
              {openedUrl && (
                <div data-testid="opened-url-hint" style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, background: "var(--panel-800, #1a1a2e)", border: "1px solid var(--accent-blue)", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Your results page is open in a new tab.</strong>
                  <span> Press <kbd>Ctrl+A</kbd> to select all, <kbd>Ctrl+C</kbd> to copy, then paste below.</span>
                </div>
              )}
              <SplitImportPanel onImport={handleImport} onCancel={() => void navigate("/hyrox-calculator")} />
            </>
          ) : (
            <div>
              <h2>Import your results</h2>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: 8 }}>
                Paste a link to your results page and we'll try to import automatically.
              </label>
              <input
                data-testid="url-input"
                type="url"
                placeholder="https://results.hyrox.com/season-8/?..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-950)", color: "var(--text-primary)" }}
              />
              {urlError && <div data-testid="url-error" style={{ color: "var(--accent-red)", marginTop: 8 }}>{urlError}</div>}
              <div style={{ marginTop: 16 }}>
                <PrimaryButton type="button" data-testid="fetch-btn" loading={loading} onClick={() => void handleFetch()}>
                  Fetch Results
                </PrimaryButton>
              </div>
              {urlResult && (
                <div data-testid="parse-confirm" style={{ marginTop: 16, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Import summary</strong>
                  <div>Splits: {urlResult.splits.length} / 16</div>
                  <div>Race Replay: {urlResult.raceReplay?.length ? `${urlResult.raceReplay.length} stations` : "Not imported"}</div>
                  <div>Penalties: {urlResult.penalties.length || "None"}</div>
                  <PrimaryButton type="button" data-testid="confirm-btn" onClick={() => handleImport(urlResult)}>
                    Looks right? Continue →
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}
        </FormPanel>
      </div>
    </Shell>
  );
}
