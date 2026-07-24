import { bandScoreColor, bandScoreLabel, enforceTone, formatGain, formatOverallStanding, formatPercentileRank, formatTime, regionalContextLine } from "./copyFormatter.js";
import { buildHeroCopy } from "../interpretation/hyroxInterpretationEngine.js";
import { nextPerformanceBand, PERFORMANCE_BAND_ORDER, performanceBandForGoal } from "../engine/benchmarkSelector.js";
import { getBenchmarkStats } from "../engine/benchmarkService.js";
import { compareLimiterSegments, findBiggestLimiter } from "../engine/limiterService.js";
import { approximatePercentile } from "../engine/percentileCalculator.js";
import { RUN_KEYS } from "../config/segmentMap.js";
import { penaltyContext } from "./penaltyContext.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname_email = dirname(fileURLToPath(import.meta.url));

let FORMA_LOGO_B64 = "";
const FORMA_LOGO_PATHS = [
  "./assets/forma-logo.png",
  "../../../../web/src/assets/forma-logo.png",
  "../../../../docs/planning/login_page_logos/Forma logo.png",
];
for (const relativeLogoPath of FORMA_LOGO_PATHS) {
  try {
    const logoPath = resolve(__dirname_email, relativeLogoPath);
    FORMA_LOGO_B64 = `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;
    break;
  } catch {
    // Try the next bundled logo path; header and footer fall back to text mark if none load.
  }
}

function eliteBandLabel(bsLabel) {
  if (bsLabel === "Priority") return "Next refinement";
  if (bsLabel === "Opportunity") return "Marginal gain";
  return bsLabel;
}

function bandDisplayLabel(band, options = {}) {
  if (!band) return null;
  if (band === "over_120") return "120:00+";
  if (band === "sub_120") return "105:00-119:59";
  if (band === "sub_105") return "100:00-104:59";
  return band.replace("sub_", "sub-");
}

function positiveSeconds(...values) {
  for (const value of values) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}

function selectedTargetSecondsForEmail(analysisJson = {}, athleteContext = {}) {
  const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  return positiveSeconds(
    analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds,
    totalSeg?.exactTargetSeconds,
    athleteContext.targetFinishTimeSeconds,
    athleteContext.targetTimeSeconds,
    analysisJson.race?.targetTimeSeconds,
    analysisJson.race?.targetFinishTimeSeconds,
  );
}

function pluralStation(label) {
  return /lunges|balls|jumps$/i.test(String(label ?? ""));
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isUppercaseNameToken(value) {
  return /[A-Z]/.test(String(value ?? "")) && String(value ?? "").length > 1 && String(value ?? "") === String(value ?? "").toUpperCase();
}

function firstGreetingNameFromPart(rawPart) {
  const trimmed = String(rawPart ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(",")) {
    const first = trimmed.slice(trimmed.indexOf(",") + 1).trim().split(/\s+/)[0];
    return first || null;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && isUppercaseNameToken(parts[0]) && !isUppercaseNameToken(parts[1])) {
    return parts[1];
  }
  return parts[0] ?? null;
}

function titleCaseNameToken(value) {
  const token = String(value ?? "").trim();
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function resolveGreetingName(rawName) {
  if (!rawName) return "there";
  const firstNames = String(rawName)
    .split(" & ")
    .map(firstGreetingNameFromPart)
    .filter(Boolean)
    .map(titleCaseNameToken);
  return firstNames.length > 0 ? firstNames.join(" & ") : "there";
}

function inlineStyle(props) {
  return Object.entries(props).map(([key, value]) => `${key}:${value}`).join(";");
}

const emailTheme = {
  bg: "#07111f",
  panel: "#0e1f34",
  panelElevated: "#12263d",
  card: "#0b1628",
  border: "rgba(148,163,184,0.18)",
  borderSoft: "rgba(148,163,184,0.12)",
  borderStrong: "rgba(34,211,238,0.32)",
  text: "#f8fafc",
  textBody: "#cbd5e1",
  textMuted: "#94a3b8",
  cyan: "#22d3ee",
  blue: "#0f6fff",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
};

const darkSemanticColors = [
  ["background-color:#f0f4f8", `background-color:${emailTheme.bg}`],
  ["background-color:#ffffff", `background-color:${emailTheme.panel}`],
  ["background-color:#f8fafc", `background-color:${emailTheme.panelElevated}`],
  ["background-color:#f1f5f9", `background-color:${emailTheme.card}`],
  ["background-color:#e2e8f0", `background-color:${emailTheme.panelElevated}`],
  ["background-color:#e8f7fd", `background-color:#0a2030`],
  ["background-color:#f0f9ff", `background-color:#0a2030`],
  ["background-color:#fffbeb", `background-color:#2a1f0b`],
  ["background-color:#fef3c7", `background-color:#2a1f0b`],
  ["background-color:#fffdf7", `background-color:#2c1e07`],
  ["background-color:#fee2e2", `background-color:#2a1114`],
  ["background-color:#fff4f4", `background-color:#2a1114`],
  ["background-color:#dcfce7", `background-color:#0f2a1c`],
  ["background-color:#f0fdf4", `background-color:#0f2a1c`],
  ["background-color:#f5f3ff", `background-color:#1f1735`],
  ["background-color:#ede9fe", `background-color:#1f1735`],
];

const darkSemanticBorders = [
  ["border:1px solid #e2e8f0", `border:1px solid ${emailTheme.border}`],
  ["border-top:1px solid #e2e8f0", `border-top:1px solid ${emailTheme.border}`],
  ["border-bottom:1px solid #e2e8f0", `border-bottom:1px solid ${emailTheme.border}`],
  ["border-left:3px solid #e2e8f0", `border-left:3px solid ${emailTheme.border}`],
  ["border-bottom:1px solid #f1f5f9", `border-bottom:1px solid ${emailTheme.borderSoft}`],
  ["border-top:2px solid #e2e8f0", `border-top:2px solid ${emailTheme.border}`],
  ["border-bottom:2px solid #e2e8f0", `border-bottom:2px solid ${emailTheme.border}`],
  ["border:1px solid #bae6fd", `border:1px solid ${emailTheme.borderStrong}`],
  ["border-top:1px solid #bae6fd", `border-top:1px solid ${emailTheme.borderStrong}`],
  ["border-bottom:1px solid #bae6fd", `border-bottom:1px solid ${emailTheme.borderStrong}`],
  ["border:1px solid #bdeafb", `border:1px solid ${emailTheme.borderStrong}`],
  ["border:1px solid #fde68a", `border:1px solid rgba(245,158,11,0.36)`],
  ["border:1px solid #ddd6fe", `border:1px solid rgba(139,92,246,0.36)`],
];

const darkSemanticText = [
  ["color:#0f172a", `color:${emailTheme.text}`],
  ["color:#475569", `color:${emailTheme.textBody}`],
  ["color:#64748b", `color:${emailTheme.textMuted}`],
  ["color:#4a5568", `color:${emailTheme.textMuted}`],
  ["color:#0369a1", `color:${emailTheme.cyan}`],
  ["color:#92400e", `color:${emailTheme.amber}`],
  ["color:#78350f", "color:#fcd9a0"],
  ["color:#d97706", `color:${emailTheme.amber}`],
  ["color:#16a34a", `color:${emailTheme.green}`],
  ["color:#dc2626", "color:#fca5a5"],
  ["color:#e53e3e", `color:${emailTheme.red}`],
  ["color:#7c3aed", `color:${emailTheme.purple}`],
  ["color:#6366f1", `color:${emailTheme.purple}`],
  ["color:#6699ff", `color:${emailTheme.blue}`],
];

function applyUnifiedDarkTheme(html) {
  return [...darkSemanticColors, ...darkSemanticBorders, ...darkSemanticText]
    .reduce((current, [from, to]) => current.replaceAll(from, to), String(html));
}

function limiterName(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter?.label ?? analysisJson.limiters?.[0]?.label ?? null;
}

function contentText(content) {
  if (Array.isArray(content)) return content.filter((item) => typeof item === "string").join("\n");
  return String(content ?? "");
}

function thesisSectionKey(category) {
  const map = {
    penalty: "penalty_callout",
    station_capacity: "biggest_limiter",
    running: "running_fatigue",
    roxzone: "roxzone_execution",
    pacing: "running_fatigue",
    muscle_group: "muscle_group_profile",
    data_quality: "executive_summary",
  };
  return map[category] ?? null;
}

function sectionAccentColor(sectionKey, interpretation) {
  if (sectionKey === "penalty_callout") return "#7c3aed";
  if (!interpretation) return "#e2e8f0";
  const primaryKey = thesisSectionKey(interpretation.primaryThesis?.category);
  const secondaryKeys = (interpretation.secondaryTheses ?? []).map((thesis) => thesisSectionKey(thesis.category));
  if (sectionKey === primaryKey) return "#22d3ee";
  if (secondaryKeys.includes(sectionKey)) return "#f59e0b";
  return "#e2e8f0";
}

function headingDot(accentColor) {
  if (accentColor !== "#22d3ee" && accentColor !== "#f59e0b") return "";
  return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${accentColor};margin-right:6px;vertical-align:middle;"></span>`;
}

const FORMA_MASTHEAD_ASPECT_RATIO = 401 / 70;
const FORMA_BRAND_BLUE = "#00a3f5";

function logoMark(size = 28) {
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  if (FORMA_LOGO_B64) {
    return `<img src="${FORMA_LOGO_B64}" alt="Forma — Measure. Understand. Improve." width="${width}" height="${size}"
      style="width:${width}px;height:${size}px;display:block;" />`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:${Math.round(size * 0.2)}px;">
    <span style="display:inline-flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;background-color:${FORMA_BRAND_BLUE};border-radius:6px;
      color:#ffffff;font-family:'Inter Tight',Arial,sans-serif;font-size:${Math.round(size * 0.5)}px;
      font-weight:800;line-height:1;">F</span>
    <span style="font-family:'Inter Tight','Arial Narrow',Arial,sans-serif;font-size:${Math.round(size * 0.6)}px;
      font-weight:700;color:#f8fafc;letter-spacing:0.5px;line-height:1;">FORMA</span>
  </span>`;
}

function renderHeader() {
  return `<tr>
    <td style="background-color:#07111f;padding:20px 32px;border-radius:8px 8px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="vertical-align:middle;">${logoMark(28)}</td>
          <td style="text-align:right;vertical-align:middle;">
            <span style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:11px;">www.getforma.fit</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function stationHeroHeadline(limiterLabel) {
  return `THE ${String(limiterLabel ?? "").toUpperCase()} STATION IS YOUR BIGGEST OPPORTUNITY`;
}

function buildFallbackHeroCopy(analysisJson = {}) {
  const { totalPenaltySeconds, usePenaltyHero } = penaltyContext(analysisJson);
  const limiter = analysisJson.headline?.biggestLimiter ?? null;
  const gainSeconds = analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? null;
  const showGain = Number.isFinite(gainSeconds) && gainSeconds > 0;
  const gainDisplay = showGain ? formatGain(gainSeconds) : null;

  if (usePenaltyHero) {
    return {
      headline: `${formatGain(totalPenaltySeconds)} OF PENALTIES IS YOUR FASTEST WIN`,
      subline: "Clean this up before chasing fitness gains.",
      gainDisplay: formatGain(totalPenaltySeconds),
    };
  }

  return {
    headline: limiter ? stationHeroHeadline(limiter.label) : "YOUR HYROX ANALYSIS IS READY",
    subline: gainDisplay ? "Largest single-station gap against your target benchmark." : null,
    gainDisplay,
  };
}

// Below this many percentile points, the age-group and overall standings are treated as
// materially the same and no separate callout is shown -- avoids noise from small-sample wobble.
const AGE_GROUP_STANDING_DIFFERENCE_THRESHOLD_POINTS = 10;

function renderHero(analysisJson, greetingName, interpretation = null) {
  const fallbackCopy = buildFallbackHeroCopy(analysisJson);
  const heroCopy = interpretation?.heroCopy ?? fallbackCopy;
  const headlineText = esc(heroCopy.headline ?? "YOUR HYROX ANALYSIS IS READY");
  const showGain = heroCopy.gainDisplay != null;
  const heroNumber = showGain
    ? `<div style="${inlineStyle({
        "font-family": "'Courier New',Courier,monospace",
        "font-size": "56px",
        "font-weight": "700",
        color: "#22d3ee",
        "line-height": "1",
        margin: "8px 0 12px",
      })}">${esc(heroCopy.gainDisplay)}</div>`
    : "";
  const subline = heroCopy.subline
    ? `<div style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:13px;margin-bottom:0;">${esc(heroCopy.subline)}</div>`
    : "";
  const regionalLine = (() => {
    const text = regionalContextLine(analysisJson);
    if (!text) return "";
    return `<div style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:12px;font-style:italic;margin-top:6px;">${esc(text)}</div>`;
  })();
  const comparisonContextLine = (() => {
    const isAnalyseMode = Boolean(analysisJson?.benchmarkContext?.analysisFrame);
    const { achievedBand, comparisonBand, group } = resolvedComparisonBandInfo(analysisJson);
    if (!isAnalyseMode || !achievedBand) return "";
    const groupLabel = benchmarkLensComparisonGroupLabel(comparisonBand, group);
    const sampleSize = Number(group?.sampleSize);
    const sampleText = Number.isFinite(sampleSize) && sampleSize > 0
      ? `${sampleSize.toLocaleString()} `
      : "";
    return `<div style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:12px;font-style:italic;margin-top:6px;">Compared against ${sampleText}${groupLabel}.</div>`;
  })();
  const ageGroupStandingLine = (() => {
    const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
    const overallPct = Number(totalSeg?.overallFieldPercentile);
    const agePct = Number(totalSeg?.fieldPercentile);
    if (!Number.isFinite(overallPct) || !Number.isFinite(agePct)) return "";
    if (Math.abs(agePct - overallPct) < AGE_GROUP_STANDING_DIFFERENCE_THRESHOLD_POINTS) return "";
    const ageTopPct = Math.max(1, Math.round(100 - agePct));
    return `<div style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:12px;font-style:italic;margin-top:6px;">Within your age group specifically, this ranks you in the top ${ageTopPct}% -- meaningfully different from your standing across the full field.</div>`;
  })();

  return `<tr>
    <td style="${inlineStyle({
      "background-color": "#07111f",
      padding: "28px 32px 24px 29px",
      "border-left": "3px solid #22d3ee",
      "border-bottom": "1px solid rgba(148,163,184,0.12)",
    })}">
      <p style="color:#94a3b8;font-family:Inter,Arial,sans-serif;font-size:14px;margin:0 0 18px;">Hi ${esc(greetingName)},</p>
      <div style="${inlineStyle({
        "font-family": "'Inter Tight','Arial Narrow',Arial,sans-serif",
        "font-size": "30px",
        "font-weight": "700",
        color: "#f8fafc",
        "line-height": "1.1",
        "text-transform": "uppercase",
        "margin-bottom": "4px",
      })}">${headlineText}</div>
      ${heroNumber}
      ${subline}
      ${regionalLine}
      ${comparisonContextLine}
      ${ageGroupStandingLine}
    </td>
  </tr>`;
}

function analyseBenchmarkCellLabel(analysisJson) {
  const achievedBand = analysisJson?.benchmarkContext?.achievedBand;
  const useOver105Band = Boolean(analysisJson?.benchmarkContext?.useDoublesBenchmarks);
  const bandLabel = bandDisplayLabel(achievedBand, { useOver105Band });
  const groupLabel = analysisJson?.benchmarkContext?.primaryBenchmarkGroup?.label ?? "Your division";
  const confidence = analysisJson?.benchmarkContext?.confidenceLabel;
  const confidenceSuffix = confidence === "insufficient"
    ? " (directional)"
    : "";
  return bandLabel ? `${bandLabel} - ${groupLabel}${confidenceSuffix}` : `${groupLabel}${confidenceSuffix}`;
}

const BAND_RANGES = {
  sub_60: "under 60:00",
  sub_65: "between 60:00 and 64:59",
  sub_70: "between 65:00 and 69:59",
  sub_75: "between 70:00 and 74:59",
  sub_80: "between 75:00 and 79:59",
  sub_85: "between 80:00 and 84:59",
  sub_90: "between 85:00 and 89:59",
  sub_95: "between 90:00 and 94:59",
  sub_100: "between 95:00 and 99:59",
  sub_105: "between 100:00 and 104:59",
  sub_120: "between 105:00 and 119:59",
  over_120: "120:00 and above",
};

const FINISH_BAND_SHORT_LABELS = Object.freeze({
  sub_60: "Sub-60", sub_65: "60–65", sub_70: "65–70", sub_75: "70–75",
  sub_80: "75–80", sub_85: "80–85", sub_90: "85–90", sub_95: "90–95",
  sub_100: "95–100", sub_105: "100–105", sub_120: "105–120", over_120: "120+",
});

function currentFinishBand(analysisJson = {}, athleteContext = {}) {
  if (analysisJson.benchmarkContext?.achievedBand) return analysisJson.benchmarkContext.achievedBand;
  const seconds = analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds;
  return performanceBandForGoal(seconds, { includeOver105: true });
}

function targetFinishBand(analysisJson = {}, athleteContext = {}) {
  const seconds = selectedTargetSecondsForEmail(analysisJson, athleteContext);
  return seconds ? performanceBandForGoal(seconds, { includeOver105: true }) : null;
}

function isCumulativePerformanceBandGroup(group = null) {
  const datasetVersion = String(group?.datasetVersion ?? group?.dataset_version ?? "");
  return datasetVersion.startsWith("historical_hyrox_");
}

function benchmarkLensComparisonGroupLabel(band, group = null) {
  const bandShortLabel = FINISH_BAND_SHORT_LABELS[band] ?? band;
  const rawRange = BAND_RANGES[band];
  if (!rawRange) return `${bandShortLabel} min band`;
  if (rawRange.startsWith("under")) return "Sub-60 finishers";
  if (rawRange.includes("and above")) return "120+ finishers";
  if (isCumulativePerformanceBandGroup(group)) {
    const threshold = String(band ?? "").match(/^sub_(\d+)$/)?.[1];
    return threshold ? `Under ${threshold}:00 finishers` : `${bandShortLabel} finishers`;
  }
  return `${rawRange.replace("between ", "").replace(" and ", "–")} finishers`;
}

// Mirrors the escalation check in hyroxAnalysisEngine.js's addFrameGaps() so the email copy
// (comparison group label, sample size, explanation text) always matches the band the
// station/run gap numbers were actually computed against, not just the athlete's own band.
function resolvedComparisonBandInfo(analysisJson = {}, fallbackAchievedBand = null) {
  const benchmarkContext = analysisJson.benchmarkContext ?? {};
  const achievedBand = benchmarkContext.achievedBand ?? fallbackAchievedBand ?? null;
  const analysisFrame = benchmarkContext.analysisFrame ?? {};
  const comparisonBand = analysisFrame.comparisonBand ?? achievedBand;
  const isEscalated = Boolean(comparisonBand) && comparisonBand !== achievedBand;
  const escalationBasisBand = benchmarkContext.escalationBasisBand ?? achievedBand;
  const group = comparisonBand === achievedBand
    ? benchmarkContext.primaryBenchmarkGroup
    : comparisonBand === escalationBasisBand
      ? benchmarkContext.escalationBasisBandGroup
      : benchmarkContext.nextBandGroup;
  const plainNextBand = nextPerformanceBand(achievedBand);
  const penaltyAdjustedReclassification = isEscalated &&
    escalationBasisBand &&
    escalationBasisBand !== achievedBand &&
    comparisonBand === escalationBasisBand;
  const penaltyAdjustedEscalation = isEscalated &&
    escalationBasisBand &&
    escalationBasisBand !== achievedBand &&
    comparisonBand !== plainNextBand;
  return {
    achievedBand,
    escalationBasisBand,
    comparisonBand: comparisonBand ?? achievedBand,
    isEscalated,
    penaltyAdjustedReclassification,
    penaltyAdjustedEscalation,
    group,
  };
}

function methodNoteComparisonGroup(analysisJson = {}, calculatorMode = "target") {
  const benchmarkContext = analysisJson.benchmarkContext ?? {};
  if (calculatorMode === "target" && benchmarkContext.goalBenchmarkGroup) {
    return benchmarkContext.goalBenchmarkGroup;
  }
  return resolvedComparisonBandInfo(analysisJson).group;
}

function renderLensDataRow({ label, value, valueColor, valueSize = "13px", valueWeight = "400", valueFamily = "Inter,Arial,Helvetica,sans-serif", divided = false }) {
  const tableStyle = divided
    ? "border-top:1px solid #1c3350;padding-top:10px;margin-top:10px;"
    : "";
  return `<table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0" style="${tableStyle}">
    <tr>
      <td valign="top" style="color:${emailTheme.textMuted};font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;">${esc(label)}</td>
      <td valign="top" align="right" style="color:${valueColor};font-family:${valueFamily};font-size:${valueSize};font-weight:${valueWeight};line-height:1.35;padding-left:14px;">${esc(value)}</td>
    </tr>
  </table>`;
}

function renderBenchmarkLensCard(analysisJson = {}, athleteContext = {}) {
  const currentBand = currentFinishBand(analysisJson, athleteContext);
  const currentIndex = PERFORMANCE_BAND_ORDER.indexOf(currentBand);
  if (currentIndex < 0) return "";

  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds;
  const finishTime = formatTime(finishSeconds);
  if (!finishTime) return "";

  const { comparisonBand, escalationBasisBand, isEscalated, penaltyAdjustedReclassification, penaltyAdjustedEscalation, group } = resolvedComparisonBandInfo(analysisJson, currentBand);
  const comparisonGroupLabel = benchmarkLensComparisonGroupLabel(comparisonBand, group);
  const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");

  // Benchmark median — same source as the metric strip's comparison time
  const bandMedianSecs = positiveSeconds(
    totalSeg?.exactTargetSeconds,
    totalSeg?.goalBenchmarkSeconds,
    analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds,
  );
  const bandMedianTime = bandMedianSecs ? formatTime(bandMedianSecs) : null;

  // Deliberately band-relative: Benchmark Lens standing compares within the selected performance band.
  const comparisonBandStats = isEscalated && group?.key
    ? getBenchmarkStats(group.key, "total_time")
    : null;
  const userSecondsForStanding = Number.isFinite(totalSeg?.userSecondsNetOfPenalty)
    ? totalSeg.userSecondsNetOfPenalty
    : totalSeg?.userSeconds;
  const percentileValue = comparisonBandStats
    ? approximatePercentile(userSecondsForStanding, comparisonBandStats)
    : Number(totalSeg?.percentile);
  const percentileText = Number.isFinite(percentileValue)
    ? `${formatPercentileRank(percentileValue)} within this band`
    : null;
  const isHighInBand = Number.isFinite(percentileValue) && percentileValue >= 80;
  const isLowSample = analysisJson.benchmarkContext?.confidenceLabel === "insufficient";
  const lensCompBandLabel = isEscalated ? bandDisplayLabel(comparisonBand) : null;
  const lensBandLabel = bandDisplayLabel(currentBand);

  let explanationText;
  if (penaltyAdjustedReclassification && lensCompBandLabel) {
    explanationText = `The standing above ranks you within the ${lensBandLabel} band. Because your penalty-adjusted time falls in the ${lensCompBandLabel} band, gaps below are measured against that band instead of your official ${lensBandLabel} classification.`;
  } else if (penaltyAdjustedEscalation && lensCompBandLabel) {
    const basisLabel = bandDisplayLabel(escalationBasisBand);
    explanationText = `The standing above ranks you within the ${lensBandLabel} band. Because your penalty-adjusted time already beats the ${basisLabel} median, gaps below are measured against the ${lensCompBandLabel} band instead - that's the level your execution is really at.`;
  } else if (isEscalated && lensCompBandLabel) {
    explanationText = `The standing above ranks you within the ${lensBandLabel} band. Because you've already beaten that band's median, the station and run gaps further down are measured against the ${lensCompBandLabel} band instead — that's the next benchmark worth chasing.`;
  } else if (isHighInBand && currentBand === "sub_60") {
    explanationText = "You are high within the sub-60 band — HYROX's fastest benchmark tier, so there is no faster band to compare against. This standing is against the top of the field.";
  } else if (isHighInBand) {
    explanationText = "You are high within this band. The next useful comparison is the band ahead.";
  } else {
    explanationText = "Your percentiles compare you with athletes at a similar race level, not the full HYROX field.";
  }
  if (isLowSample) {
    explanationText += " This band has a smaller sample size — treat scores as directional.";
  }

  const standingRow = percentileText
    ? renderLensDataRow({
        label: "Your standing",
        value: percentileText,
        valueColor: emailTheme.cyan,
        valueSize: "14px",
        valueWeight: "700",
        valueFamily: "'Inter Tight','Arial Narrow',Arial,sans-serif",
        divided: true,
      })
    : "";

  const bandMedianRow = bandMedianTime
    ? renderLensDataRow({
        label: "Band median",
        value: bandMedianTime,
        valueColor: emailTheme.textBody,
        valueSize: "13px",
        divided: true,
      })
    : "";

  return `<tr data-section="benchmark-lens">
    <td style="background-color:${emailTheme.panel};padding:0 24px 20px;border-bottom:1px solid #1c3350;">
      <span style="color:${emailTheme.cyan};font-family:'Inter Tight','Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;display:block;margin-bottom:12px;">BENCHMARK LENS</span>
      <div style="background-color:${emailTheme.panelElevated};border:1px solid #1c3350;border-left:3px solid ${emailTheme.cyan};border-radius:8px;padding:16px 18px;">
        ${renderLensDataRow({
          label: "Your race",
          value: finishTime,
          valueColor: emailTheme.cyan,
          valueSize: "18px",
          valueWeight: "800",
          valueFamily: "'Inter Tight','Arial Narrow',Arial,sans-serif",
        })}
        ${renderLensDataRow({
          label: "Comparison group",
          value: comparisonGroupLabel,
          valueColor: emailTheme.textBody,
          valueSize: "13px",
          divided: true,
        })}
        ${bandMedianRow}
        ${standingRow}
        <p style="border-top:1px solid #1c3350;padding-top:10px;margin:10px 0 0;color:${emailTheme.textMuted};font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">${esc(explanationText)}</p>
      </div>
    </td>
  </tr>`;
}

function renderTargetLensCard(analysisJson = {}, athleteContext = {}) {
  const currentBand = currentFinishBand(analysisJson, athleteContext);
  const currentIndex = PERFORMANCE_BAND_ORDER.indexOf(currentBand);
  if (currentIndex < 0) return renderBenchmarkLensCard(analysisJson, athleteContext);

  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds;
  const currentFinishTime = formatTime(finishSeconds);
  if (!currentFinishTime) return "";

  const targetSeconds = selectedTargetSecondsForEmail(analysisJson, athleteContext);
  if (!targetSeconds) return renderBenchmarkLensCard(analysisJson, athleteContext);

  const targetTime = formatTime(targetSeconds);
  const targetBand = targetFinishBand(analysisJson, athleteContext);
  const targetIndex = PERFORMANCE_BAND_ORDER.indexOf(targetBand);
  const currentBandLabel = FINISH_BAND_SHORT_LABELS[currentBand] ?? currentBand;
  const targetBandLabel = FINISH_BAND_SHORT_LABELS[targetBand] ?? targetBand ?? "target";
  const bandDelta = targetIndex >= 0 ? Math.abs(targetIndex - currentIndex) : 0;
  const isSameBand = targetIndex === currentIndex || targetIndex < 0;
  const targetIsFaster = targetIndex >= 0 && targetIndex < currentIndex;
  const targetIsSlower = targetIndex > currentIndex;

  let explanationText;
  if (isSameBand) {
    explanationText = "Your target sits inside your current finish band — the goal is refinement rather than a full band jump.";
  } else if (targetIsSlower) {
    const plural = bandDelta === 1 ? "band" : "bands";
    explanationText = `You are already ${bandDelta} ${plural} ahead of your target. The gaps below show where further time can come from.`;
  } else if (targetIsFaster) {
    const plural = bandDelta === 1 ? "band" : "bands";
    explanationText = `Your target is ${bandDelta} ${plural} ahead. The gaps below show where that time needs to come from.`;
  } else {
    explanationText = "Your target sits inside your current finish band — the goal is refinement rather than a full band jump.";
  }

  return `<tr data-section="target-lens">
    <td style="background-color:${emailTheme.panel};padding:0 24px 20px;border-bottom:1px solid #1c3350;">
      <span style="color:${emailTheme.amber};font-family:'Inter Tight','Arial Narrow',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;display:block;margin-bottom:12px;">TARGET LENS</span>
      <div style="background-color:${emailTheme.panelElevated};border:1px solid #1c3350;border-left:3px solid ${emailTheme.amber};border-radius:8px;padding:16px 18px;">
        ${renderLensDataRow({
          label: "Current finish",
          value: `${currentFinishTime} · ${currentBandLabel} min band`,
          valueColor: emailTheme.textBody,
          valueSize: "14px",
          valueFamily: "'Inter Tight','Arial Narrow',Arial,sans-serif",
        })}
        ${renderLensDataRow({
          label: "Target finish",
          value: `${targetTime} · ${targetBandLabel} min band`,
          valueColor: emailTheme.amber,
          valueSize: "14px",
          valueWeight: "700",
          valueFamily: "'Inter Tight','Arial Narrow',Arial,sans-serif",
          divided: true,
        })}
        <p style="border-top:1px solid #1c3350;padding-top:10px;margin:10px 0 0;color:${emailTheme.textMuted};font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">${esc(explanationText)}</p>
      </div>
    </td>
  </tr>`;
}

function renderMetricStrip(analysisJson, athleteContext, calculatorMode = "target") {
  const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const { totalPenaltySeconds, penaltiesAreMaterial, adjustedRaceTimeSeconds } = penaltyContext(analysisJson);
  const finishTime = formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "-";
  const selectedTargetSeconds = selectedTargetSecondsForEmail(analysisJson, athleteContext);
  const comparisonSeconds = calculatorMode === "analyse"
    ? positiveSeconds(totalSeg?.exactTargetSeconds, totalSeg?.goalBenchmarkSeconds, analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds)
    : selectedTargetSeconds;
  const benchmarkTime = comparisonSeconds ? formatTime(comparisonSeconds) : "-";
  const adjustedTime = Number.isFinite(adjustedRaceTimeSeconds) ? formatTime(adjustedRaceTimeSeconds) : "-";
  // Deliberately age-agnostic: overallFieldPercentile (division + gender, all ages) is the true
  // overall standing. fieldPercentile can be age-group-scoped and is used only as a fallback here
  // and for the age-group callout below when it differs substantially from the overall figure.
  const rank = esc(formatOverallStanding(totalSeg?.overallFieldPercentile ?? totalSeg?.fieldPercentile ?? totalSeg?.percentile) ?? "-");
  const rankLabel = "OVERALL STANDING";
  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds;
  const targetGapSeconds = Number.isFinite(finishSeconds) && Number.isFinite(selectedTargetSeconds)
    ? finishSeconds - selectedTargetSeconds
    : null;
  const targetGap = Number.isFinite(targetGapSeconds)
    ? targetGapSeconds <= 0 ? "On target" : formatGain(targetGapSeconds)
    : "-";
  const penalties = analysisJson.penalties ?? [];
  const hasPenalties = penalties.length > 0;
  const showAdjusted = hasPenalties && penaltiesAreMaterial;

  const colWidth = hasPenalties ? "25%" : "33%";
  const cellStyle = (borderRight = true) => inlineStyle({
    padding: "14px 14px",
    "text-align": "center",
    "vertical-align": "middle",
    ...(borderRight ? { "border-right": "1px solid rgba(148,163,184,0.12)" } : {}),
  });
  const labelStyle = inlineStyle({
    display: "block",
    color: "#64748b",
    "font-family": "Inter,Arial,sans-serif",
    "font-size": "10px",
    "text-transform": "uppercase",
    "letter-spacing": "0.06em",
    "margin-bottom": "6px",
  });
  function metricCell(label, value, valueColor = "#f8fafc", borderRight = true, valueFont = "'Courier New',Courier,monospace") {
    return `<td width="${colWidth}" style="${cellStyle(borderRight)}">
      <span style="${labelStyle}">${esc(label)}</span>
      <span style="display:block;font-family:${valueFont};font-size:15px;font-weight:700;color:${valueColor};">${value}</span>
    </td>`;
  }
  const penaltyCell = hasPenalties
    ? metricCell("PENALTIES", totalPenaltySeconds > 0 ? esc(formatGain(totalPenaltySeconds) ?? "-") : "None", totalPenaltySeconds > 0 ? "#7c3aed" : "#22c55e", false)
    : "";
  const secondCell = showAdjusted
    ? metricCell("ADJUSTED", esc(adjustedTime), "#f8fafc", true)
    : calculatorMode === "analyse"
      ? metricCell(
          "BENCHMARK BAND",
          esc(analyseBenchmarkCellLabel(analysisJson)),
          "#f8fafc",
          true,
          "Inter,Arial,Helvetica,sans-serif",
        )
		      : metricCell("TARGET TIME", esc(benchmarkTime), "#f8fafc", true);
  const thirdCell = calculatorMode === "analyse"
    ? metricCell(rankLabel, rank, "#f8fafc", hasPenalties, "Inter,Arial,Helvetica,sans-serif")
    : metricCell(
        "TARGET GAP",
        esc(targetGap),
        Number.isFinite(targetGapSeconds) && targetGapSeconds <= 0 ? "#22c55e" : "#d97706",
        hasPenalties,
        "Inter,Arial,Helvetica,sans-serif",
      );

  return `<tr>
    <td style="background-color:#07111f;border-top:1px solid rgba(148,163,184,0.12);border-bottom:1px solid rgba(148,163,184,0.12);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          ${metricCell("YOUR RACE", esc(finishTime), "#f8fafc", true)}
          ${secondCell}
	          ${thirdCell}
          ${penaltyCell}
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderExecutiveSummary(section) {
  const items = Array.isArray(section.content) ? section.content : [section.content];
  const paragraphs = items
    .filter(Boolean)
    .map((item) => `<p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0 0 10px;">${esc(enforceTone(String(item)))}</p>`)
    .join("");
  return `<tr>
	    <td style="background-color:#ffffff;padding:18px 24px;border-bottom:1px solid #e2e8f0;">
      ${paragraphs}
    </td>
  </tr>`;
}

function renderStrengthCard(section) {
  const text = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  return `
  <tr>
	    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;border-left:3px solid #22d3ee;">
      <span style="color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">BIGGEST STRENGTH</span>
    </td>
  </tr>
  <tr>
	    <td style="background-color:#ffffff;padding:16px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#0f172a;font-family:Inter,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderStationBreakdown(section) {
  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
  if (items.length <= 1) return renderTextCard({ ...section, title: "Station Breakdown" });

  const preamble = items[0];
  const stationItems = items.slice(1);
  const strengthIdx = stationItems.findIndex((item) => /your strongest station/i.test(item));
  const weakItems = strengthIdx >= 0 ? stationItems.slice(0, strengthIdx) : stationItems;
  const strengthItem = strengthIdx >= 0 ? stationItems[strengthIdx] : null;

  function stationRow(item, isLast) {
    const raw = String(item);
    const gapMatch = raw.match(/\(([+-]?\d+:\d+)/);
    const isLimiter = gapMatch && !gapMatch[1].startsWith("-");
    const gapColor = isLimiter ? "#e53e3e" : "#22d3ee";
    const borderBottom = isLast ? "" : "border-bottom:1px solid #f1f5f9;";
    const safe = esc(enforceTone(raw)).replace(
      /(\(([+-]?\d+:\d+[^)]*)\))/,
      `<span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:${gapColor};">$1</span>`,
    );
    return `<tr>
	      <td style="padding:10px 24px;${borderBottom}font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;line-height:1.4;">
        ${safe}
      </td>
    </tr>`;
  }
  const stationRows = weakItems.map((item, index) => stationRow(item, index === weakItems.length - 1 && !strengthItem)).join("");
  const strengthRow = strengthItem
    ? `<tr>
	        <td style="padding:10px 24px;border-top:1px solid #e2e8f0;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;color:#22d3ee;line-height:1.4;">
          ${esc(enforceTone(strengthItem))}
        </td>
      </tr>`
    : "";

  return `
  <tr>
	    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;">
      <span style="color:#475569;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">STATION BREAKDOWN</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:4px 0 0;border-bottom:1px solid #e2e8f0;">
	      <p style="color:#94a3b8;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 24px 4px;">${esc(preamble)}</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        ${stationRows}
        ${strengthRow}
      </table>
    </td>
  </tr>`;
}

function renderTimePotential(section) {
  const text = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  return `
  <tr>
	    <td style="background-color:#e8f7fd;padding:18px 24px;border-left:3px solid #22d3ee;border-right:3px solid #22d3ee;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">TIME POTENTIAL</span>
      <p style="color:#0f172a;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderTextCard(section, interpretation = null, analysisJson = {}) {
	  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
	  const filteredItems = items.filter(Boolean);
	  const paragraphs = section.sectionKey === "training_volume" && filteredItems.length >= 2
	    ? filteredItems.map((item, index) => {
	      const labels = ["Running volume", "Strength frequency"];
	      const marginTop = index === 0 ? "margin-top:0;" : "margin-top:12px;";
	      const text = String(item);
	      return `<div style="${marginTop}">
        <span style="font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#475569;display:block;margin-bottom:4px;">${esc(labels[index] ?? `Point ${index + 1}`)}</span>
        <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${esc(enforceTone(text))}</p>
      </div>`;
    }).join("")
    : filteredItems
      .map((item, index) => {
        const border = index > 0 ? "border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px;" : "";
        return `<p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0;${border}">${esc(enforceTone(String(item)))}</p>`;
      })
      .join("");
  const titleText = esc(String(section.title ?? "").toUpperCase());
  return `
  <tr>
    <td style="background-color:#ffffff;padding:18px 24px;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">${titleText}</span>
      ${paragraphs}
    </td>
  </tr>`;
}

function renderRoxzoneExecution(section, interpretation = null) {
  const content = Array.isArray(section.content) ? section.content : [section.content];
  const stringContent = content.filter((item) => typeof item === "string");
  if (stringContent.length === 0) return "";
  // Use a fixed heading so test 35's "ROXZONE EXECUTION" mock title doesn't bleed through,
  // and so the real pipeline's "Roxzone and Execution Profile" title also resolves correctly.
  return renderTextCard({ ...section, title: "Roxzone and Execution Profile", content: stringContent }, interpretation);
}

function renderPenaltyCallout(section, interpretation = null, analysisJson = {}) {
  const { totalPenaltySeconds, penaltiesAreMaterial, adjustedRaceTimeSeconds } = penaltyContext(analysisJson);
  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
  const paragraphs = items
    .filter(Boolean)
    .map((item) => `<p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px;">${esc(enforceTone(String(item)))}</p>`)
    .join("");
  const penaltySegMap = new Map((analysisJson.segments ?? []).map((segment) => [segment.segmentKey, segment]));
  const { runPenaltySeconds, runPenaltyLabels, nonRunPenaltyLabels } = penaltyLabelBreakdown(analysisJson.penalties, penaltySegMap);
  const penaltySummarySentence = runPenaltySeconds > 0 && nonRunPenaltyLabels.length === 0
    ? `${esc(formatGain(totalPenaltySeconds))} of penalties were recorded on ${esc(joinWithAnd(runPenaltyLabels))}. Treat this separately from running: it is execution leakage, not aerobic capacity.`
    : nonRunPenaltyLabels.length > 0 && runPenaltySeconds === 0
      ? `${esc(formatGain(totalPenaltySeconds))} of penalties were recorded on ${esc(joinWithAnd(nonRunPenaltyLabels))}. Treat this as station execution leakage, not a fitness limiter.`
      : `${esc(formatGain(totalPenaltySeconds))} of penalties were recorded. Treat this as execution leakage, not a fitness limiter.`;
  const materialParagraphs = penaltiesAreMaterial
    ? `<p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px;">${penaltySummarySentence}</p>`
    : paragraphs;
  const adjustedLine = adjustedRaceTimeSeconds != null
    ? `<p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:10px 0 0;">Adjusted race time without penalties: <strong>${esc(formatTime(adjustedRaceTimeSeconds))}</strong>.</p>`
    : "";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <div style="background-color:#f5f3ff;border:1px solid #ddd6fe;border-left:3px solid #7c3aed;border-radius:8px;padding:16px 18px;">
        <span style="display:block;color:#7c3aed;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">PENALTY ANALYSIS</span>
        ${materialParagraphs}
        ${adjustedLine}
      </div>
    </td>
  </tr>`;
}

function renderAthleteBackground(section) {
  const text = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;border-left:3px solid #22d3ee;">
      <span style="color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">YOUR BACKGROUND IN CONTEXT</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderRecommendations(section, analysisJson = {}) {
  const richRecs = Array.isArray(section.richRecommendations) ? section.richRecommendations : null;
  const { penaltiesAreMaterial: hasMaterialPenalties, penalties: penaltyEntries } = penaltyContext(analysisJson);
  const stationLosses = (analysisJson.segments ?? [])
    .filter((segment) => segment.type === "station" && isConfidentSegment(segment))
    .map((segment) => ({
      label: segment.label,
      gap: segment.frameGapSeconds ?? segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds,
    }))
    .filter((row) => Number.isFinite(row.gap) && row.gap > 30)
    .sort((a, b) => b.gap - a.gap);
  const limiter = analysisJson.headline?.biggestLimiter?.label ?? stationLosses[0]?.label;
  const priorities = [];
  let topNonPenaltyOpportunityLabel = null;
  if (hasMaterialPenalties) {
    priorities.push("Reclaim penalty time through station standards");
    // The penalized segment already has its own bullet above - don't also name it here as
    // a separate "needs work" opportunity when the rest of its data may look fine or strong.
    const penalizedKeys = new Set(
      (penaltyEntries ?? []).map((penalty) => penalty.segmentKey ?? penalty.runKey ?? penalty.station).filter(Boolean).map(String),
    );
    const nonPenaltyLosses = (analysisJson.segments ?? [])
      .filter((segment) => (segment.type === "station" || segment.type === "run") && isConfidentSegment(segment) && !penalizedKeys.has(segment.segmentKey))
      .map((segment) => ({
        label: segment.label,
        gap: segment.frameGapSeconds ?? segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds,
      }))
      .filter((row) => Number.isFinite(row.gap) && row.gap > 30)
      .sort((a, b) => b.gap - a.gap);
    topNonPenaltyOpportunityLabel = nonPenaltyLosses[0]?.label ?? null;
    for (const row of nonPenaltyLosses.slice(0, 2)) priorities.push(`${row.label} efficiency`);
    priorities.push("Posterior-chain strength endurance");
    priorities.push("Race-fatigued station practice");
  } else {
    if (limiter) priorities.push(`${limiter} capacity and consistency`);
    priorities.push("Quad-dominant strength endurance");
    for (const row of stationLosses.slice(1, 3)) priorities.push(`${row.label} efficiency`);
    priorities.push("Race-fatigued station practice");
  }
  const listRows = [...new Set(priorities)].slice(0, 5)
    .map((item) => `<li style="margin:0 0 4px;">${esc(enforceTone(item))}</li>`)
    .join("");
  // Anchor the headline station to the split table's gap order (same principle as limiterStr).
  // This prevents percentile tie-breaking from promoting a lower-gap station to the headline
  // when a different station has a clearly larger opportunity in the split table.
  const headlineStationLabel = (() => {
    if (hasMaterialPenalties || !richRecs?.[0]?.title) return null;
    const isRunRec = /^running/i.test(richRecs[0].title);
    if (isRunRec) return null;
    return stationLosses[0]?.label ?? null;
  })();
  const primaryTitle = hasMaterialPenalties
    ? (topNonPenaltyOpportunityLabel
        ? `Clean execution first, then ${enforceTone(topNonPenaltyOpportunityLabel)} efficiency.`
        : "Clean execution first, then targeted strength-endurance.")
    : headlineStationLabel
      ? `${enforceTone(headlineStationLabel)} under fatigue`
      : (richRecs?.[0]?.title
          ? `${enforceTone(richRecs[0].title).replace(/\s+focus$/i, "")} under fatigue`
          : "Build station-specific strength endurance under fatigue");
  const primaryCategory = hasMaterialPenalties ? "Execution" : (richRecs?.[0]?.category ?? "Fitness");
  const categoryChip = (category) => {
    const styles = {
      Fitness: { bg: "#0a2030", color: "#22d3ee", border: "rgba(34,211,238,0.32)" },
      Execution: { bg: "#1f1735", color: "#8b5cf6", border: "rgba(139,92,246,0.36)" },
      "Race management": { bg: "#2a1f0b", color: "#f59e0b", border: "rgba(245,158,11,0.36)" },
    };
    const style = styles[category] ?? styles.Fitness;
    return `<span style="display:inline-block;background-color:${style.bg};color:${style.color};border:1px solid ${style.border};font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:1px 5px;border-radius:3px;margin-left:6px;">${esc(String(category).toUpperCase())}</span>`;
  };

  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <div style="background-color:#0c1830;color:#cbd5e1;border-radius:8px;padding:18px;">
        <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">NEXT TRAINING FOCUS</span>
        <h3 style="color:#ffffff;font-family:Inter,Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;margin:0 0 12px;">${esc(primaryTitle)}${categoryChip(primaryCategory)}</h3>
        <ol style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:0;padding-left:20px;">${listRows}</ol>
      </div>
    </td>
  </tr>`;
}

function buildCtaCopy(calculatorMode, primaryCategory) {
  if (primaryCategory === "high_performer") {
    return calculatorMode === "analyse"
      ? "Use this result as your baseline and see which marginal gains would matter most for your next HYROX target."
      : "Use Forma to preserve your strengths and find the marginal gains that matter next.";
  }
  if (calculatorMode === "analyse" && primaryCategory === "data_quality") {
    return "Use this result as your baseline, then add a target time when your full split data is available.";
  }
  if (calculatorMode === "analyse") {
    return "Use this result as your baseline and see what needs to change to hit your next HYROX target.";
  }
  return "Use Forma to turn this analysis into the next race-profile decision.";
}

function renderCta(section, analysisJson = {}, ctaCopy = null, calculatorMode = "target") {
  const appBaseUrl = (process.env.FORMA_APP_BASE_URL ?? process.env.FORMA_CTA_URL ?? "https://www.getforma.fit").replace(/\/$/, "");
  const baseUrl = (process.env.BASE_URL ?? "https://www.getforma.fit").replace(/\/$/, "");
  const submissionId = analysisJson.submissionId ?? null;
  const carouselUrl = analysisJson.carouselUrl ?? (submissionId ? `${baseUrl}/api/hyrox/carousel/${submissionId}` : null);
  const rawContent = ctaCopy ?? (Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? ""));
  const bodyText = esc(enforceTone(rawContent));
  const targetParams = new URLSearchParams({ mode: "target", source: "email" });
  if (submissionId) targetParams.set("submissionId", submissionId);
  const targetCtaUrl = `${appBaseUrl}/hyrox-calculator/race-details?${targetParams.toString()}`;
  const primaryCtaLabel = calculatorMode === "target"
    ? "Want to work towards a different target time?"
    : "Want to work towards a target time?";
  const primaryCta = `<a href="${esc(targetCtaUrl)}" target="_blank" style="${inlineStyle({
    display: "inline-block",
    "background-color": "#0f6fff",
    color: "#ffffff",
    "font-family": "'Inter Tight','Arial Narrow',Arial,sans-serif",
    "font-size": "13px",
    "font-weight": "700",
    "text-transform": "uppercase",
    "letter-spacing": "0.06em",
    padding: "14px 36px",
    "border-radius": "8px",
    "text-decoration": "none",
  })}">${esc(primaryCtaLabel)} &#8594;</a>`;
  const carouselLink = carouselUrl
    ? `<a href="${esc(carouselUrl)}" target="_blank" style="display:inline-block;margin-top:${primaryCta ? "14px" : "0"};color:#22d3ee;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;text-decoration:none;">View your shareable carousel &#8594;</a>`
    : "";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e2e8f0;">
      <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0 0 20px;">${bodyText}</p>
      ${primaryCta}
      ${carouselLink}
    </td>
  </tr>`;
}

function renderTargetModeNudge(athleteContext = {}, calculatorMode = "target") {
  if (calculatorMode !== "analyse") return "";
  const targetSecs = athleteContext.targetFinishTimeSeconds ?? athleteContext.race?.targetTimeSeconds ?? null;
  if (!Number.isFinite(targetSecs) || targetSecs <= 0) return "";
  const targetFmt = formatTime(targetSecs);
  if (!targetFmt) return "";
  return `<tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;">
      <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-left:3px solid #22d3ee;border-radius:8px;padding:14px 18px;">
        <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:6px;">WANT TO HIT ${esc(targetFmt)}?</span>
        <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0;">Run the calculator in <strong style="color:#0f172a;">Hit a Target Time</strong> mode to see a split-by-split breakdown of exactly where you need to find time to make <strong style="color:#0f172a;">${esc(targetFmt)}</strong> achievable.</p>
      </div>
    </td>
  </tr>`;
}

const SPLIT_TABLE_RACE_ORDER = Object.freeze([
  "run_1", "ski_erg", "run_2", "sled_push", "run_3", "sled_pull",
  "run_4", "burpee_broad_jump", "run_5", "row", "run_6", "farmers_carry",
  "run_7", "sandbag_lunges", "run_8", "wall_balls",
]);
const SPLIT_TABLE_AGGREGATES = Object.freeze(["run_time", "work_time", "roxzone_time", "total_time"]);
const AGGREGATE_LABELS = Object.freeze({
  run_time: "Total Running",
  work_time: "Total Stations",
  roxzone_time: "Total RoxZone",
  total_time: "Total Race Time",
});
const TOP_LEVEL_GAP_RECONCILIATION_BLOCK_SECONDS = 180;

function splitSafe(value) {
  return esc(enforceTone(String(value ?? "")));
}

function splitTargetSeconds(segment, hasGoalGroup) {
  if (Number.isFinite(segment?.nextBandMedianSeconds)) return segment.nextBandMedianSeconds;
  if (Number.isFinite(segment?.exactTargetSeconds)) return segment.exactTargetSeconds;
  if (hasGoalGroup && Number.isFinite(segment?.goalBenchmarkSeconds)) return segment.goalBenchmarkSeconds;
  return Number.isFinite(segment?.benchmarkMedianSeconds) ? segment.benchmarkMedianSeconds : null;
}

function splitGapSeconds(segment, hasGoalGroup) {
  if (Number.isFinite(segment?.frameGapSeconds)) return segment.frameGapSeconds;
  if (Number.isFinite(segment?.timeGapToExactTargetSeconds)) return segment.timeGapToExactTargetSeconds;
  if (hasGoalGroup && Number.isFinite(segment?.goalBenchmarkSeconds) && Number.isFinite(segment?.userSeconds)) {
    return segment.userSeconds - segment.goalBenchmarkSeconds;
  }
  return Number.isFinite(segment?.timeGapToMedianSeconds) ? segment.timeGapToMedianSeconds : null;
}

function splitGapColor(gap) {
  if (!Number.isFinite(gap)) return "#94a3b8";
  if (gap > 90) return "#e53e3e";
  if (gap > 30) return "#d97706";
  if (gap < 0) return "#22c55e";
  return "#475569";
}

// A low-confidence segment (e.g. a repaired/estimated split) can still appear in FULL SPLIT
// DETAIL, but shouldn't drive headline-style ranking (Biggest Opportunities, MAIN INSIGHT's
// "biggest opportunities" sentence, NEXT TRAINING FOCUS) - mirrors limiterService.js's
// confidenceAboveLow, which gates the same thing for the subject line/hero/MAIN INSIGHT limiter.
function isConfidentSegment(segment) {
  return segment?.confidence !== "low";
}

function joinWithAnd(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

// Penalties can land on a run OR a station (e.g. "ROWING (120s)") - copy that assumes every
// penalty is a run penalty is wrong whenever it isn't, so every penalty-narrative site needs
// to know which segments a penalty actually belongs to before naming one.
function penaltyLabelBreakdown(penalties, segMap) {
  const list = Array.isArray(penalties) ? penalties : [];
  const map = segMap instanceof Map ? segMap : new Map();
  const penalizedKeys = [...new Set(
    list.map((penalty) => penalty.segmentKey ?? penalty.runKey ?? penalty.station).filter(Boolean).map(String),
  )];
  const runPenaltySeconds = penalizedKeys
    .filter((key) => RUN_KEYS.includes(key))
    .reduce((sum, key) => sum + list.reduce((s, p) => (String(p.segmentKey ?? p.runKey ?? p.station) === key ? s + (Number(p.penaltySeconds) || 0) : s), 0), 0);
  const runPenaltyLabels = penalizedKeys.filter((key) => RUN_KEYS.includes(key)).map((key) => map.get(key)?.label ?? key);
  const nonRunPenaltyLabels = penalizedKeys.filter((key) => !RUN_KEYS.includes(key)).map((key) => map.get(key)?.label ?? key);
  return { runPenaltySeconds, runPenaltyLabels, nonRunPenaltyLabels };
}

function splitRowBg(key, gap, top1, top2, top3) {
  if (!Number.isFinite(gap)) return "#ffffff";
  if (key === top1 || key === top2) return "#fff5f5";
  if (key === top3) return "#fffbeb";
  if (gap < 0) return "#f0fdf4";
  return "#ffffff";
}

function splitGapDisplay(gap) {
  if (!Number.isFinite(gap)) return "–";
  if (gap === 0) return "0:00";
  return `${gap > 0 ? "+" : "−"}${formatGain(Math.abs(gap))}`;
}

export function gapPill(gap) {
  if (!Number.isFinite(gap)) return "";
  const text = splitGapDisplay(gap);
  let bg;
  let color;
  if (gap < 0) { bg = "#dcfce7"; color = "#16a34a"; }
  else if (gap >= 90) { bg = "#fee2e2"; color = "#dc2626"; }
  else if (gap > 0) { bg = "#fef3c7"; color = "#d97706"; }
  else { bg = "#f1f5f9"; color = "#64748b"; }
  return `<span style="display:inline-block;background-color:${bg};color:${color};font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:3px;">${splitSafe(text)}</span>`;
}

function renderSplitTable(section, analysisJson) {
  const tableData = section.tableData ?? {};
  const segments = tableData.segments ?? analysisJson.segments ?? [];
  const penalties = tableData.penalties ?? analysisJson.penalties ?? [];
  const benchmarkContext = tableData.benchmarkContext ?? analysisJson.benchmarkContext ?? {};
  const goalGroup = benchmarkContext.goalBenchmarkGroup ?? null;
  const primaryGroup = benchmarkContext.primaryBenchmarkGroup ?? null;
  const hasGoalGroup = Boolean(goalGroup);
  const benchmarkLabel = goalGroup?.label ?? primaryGroup?.label ?? "your benchmark band";
  const achievedBand = benchmarkContext.achievedBand ?? null;
  const analysisFrame = benchmarkContext.analysisFrame ?? {};
  const gapComparisonBand = analysisFrame.comparisonBand ?? achievedBand;
  const isEliteBenchmark = achievedBand === "sub_60";
  const baseUrl = (process.env.BASE_URL ?? "https://www.getforma.fit").replace(/\/$/, "");
  const splitReportUrl = analysisJson.submissionId ? `${baseUrl}/api/hyrox/carousel/${analysisJson.submissionId}` : null;
  const segMap = new Map(segments.map((segment) => [segment.segmentKey, segment]));
  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? segMap.get("total_time")?.userSeconds ?? null;
  const isSub60Finish = Number.isFinite(finishSeconds) && finishSeconds <= 3600;
  const totalPenaltySeconds = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const hasPenalties = totalPenaltySeconds > 0;
  const totalGapSeconds = Math.max(0, splitGapSeconds(segMap.get("total_time"), hasGoalGroup) ?? 0);
  const runGapRaw = splitGapSeconds(segMap.get("run_time"), hasGoalGroup);
  const penaltiesAreMaterial =
    totalPenaltySeconds >= 60 ||
    (totalGapSeconds > 0 && totalPenaltySeconds / totalGapSeconds >= 0.10);
  const penaltiesDominate =
    totalPenaltySeconds >= 180 &&
    totalGapSeconds > 0 &&
    totalPenaltySeconds / totalGapSeconds >= 0.25;
  // Only run-attributed penalty seconds should ever be netted out of the running gap,
  // otherwise a station penalty (e.g. "ROWING (120s)") gets misrepresented as inflating
  // the athlete's running time.
  const { runPenaltySeconds, runPenaltyLabels, nonRunPenaltyLabels } = penaltyLabelBreakdown(penalties, segMap);
  const runGapNetOfPenalties = runPenaltySeconds > 0 && Number.isFinite(runGapRaw)
    ? Math.max(0, runGapRaw - runPenaltySeconds)
    : runGapRaw;
  const raceTimeSeconds = tableData.raceTimeSeconds ?? analysisJson.race?.finishTimeSeconds ?? null;
  const adjustedRaceTimeSeconds = hasPenalties && Number.isFinite(raceTimeSeconds)
    ? raceTimeSeconds - totalPenaltySeconds
    : null;
  const adjustedGapSeconds = hasPenalties && totalGapSeconds > 0
    ? Math.max(0, totalGapSeconds - totalPenaltySeconds)
    : null;

  function penaltySecondsForSegmentKey(segmentKey) {
    return penalties.reduce((sum, penalty) => {
      const keys = [penalty.segmentKey, penalty.runKey, penalty.station]
        .filter(Boolean)
        .map((value) => String(value));
      return keys.includes(segmentKey) ? sum + (Number(penalty.penaltySeconds) || 0) : sum;
    }, 0);
  }

  function splitOpportunityGap(segment) {
    const rawGap = splitGapSeconds(segment, hasGoalGroup);
    if (!penaltiesAreMaterial || !segment?.segmentKey || !Number.isFinite(rawGap)) return rawGap;
    const segmentPenaltySeconds = penaltySecondsForSegmentKey(segment.segmentKey);
    return segmentPenaltySeconds > 0 ? rawGap - segmentPenaltySeconds : rawGap;
  }

  function isPenaltyAdjustedSegment(segment) {
    return penaltiesAreMaterial && Boolean(segment?.segmentKey) && penaltySecondsForSegmentKey(segment.segmentKey) > 0;
  }

  function adjustedUserSeconds(segment) {
    if (!isPenaltyAdjustedSegment(segment) || !Number.isFinite(segment?.userSeconds)) return segment?.userSeconds;
    return Math.max(0, segment.userSeconds - penaltySecondsForSegmentKey(segment.segmentKey));
  }

  function opportunitySegmentForRanking(segment, gap) {
    if (!segment) return null;
    return {
      ...segment,
      frameGapSeconds: gap,
      timeGapToExactTargetSeconds: undefined,
      timeGapToMedianSeconds: gap,
      confidence: segment.confidence ?? "high",
    };
  }

  function compareOpportunityRows(a, b) {
    return compareLimiterSegments(
      opportunitySegmentForRanking(a.seg, a.gap),
      opportunitySegmentForRanking(b.seg, b.gap),
    );
  }

  function athleteSplitSeconds(segment) {
    return Number.isFinite(segment?.userSeconds)
      ? segment.userSeconds
      : Number.isFinite(segment?.timeSeconds)
        ? segment.timeSeconds
        : null;
  }

  function comparisonSplitSeconds(segment, gap) {
    const targetSeconds = splitTargetSeconds(segment, hasGoalGroup);
    if (Number.isFinite(targetSeconds)) return targetSeconds;
    const athleteSeconds = athleteSplitSeconds(segment);
    if (Number.isFinite(athleteSeconds) && Number.isFinite(gap)) return athleteSeconds - gap;
    return null;
  }

  function splitBandLabel(segment, gap) {
    return bandScoreLabel(gap, comparisonSplitSeconds(segment, gap));
  }

  function isAnomalousSplitRow(row) {
    if (!row?.seg || row.key === "__penalty__" || !Number.isFinite(row.gap)) return false;
    const athleteSeconds = athleteSplitSeconds(row.seg);
    const comparisonSeconds = comparisonSplitSeconds(row.seg, row.gap);
    if (!Number.isFinite(comparisonSeconds) || comparisonSeconds <= 0) return false;

    if (isNarrativeBlockingSplitRow(row)) return true;

    return row.gap > 0 && row.gap > 2.5 * comparisonSeconds;
  }

  function isNarrativeBlockingSplitRow(row) {
    if (!row?.seg || !Number.isFinite(row.gap)) return false;
    const athleteSeconds = athleteSplitSeconds(row.seg);
    const comparisonSeconds = comparisonSplitSeconds(row.seg, row.gap);
    if (!Number.isFinite(comparisonSeconds) || comparisonSeconds <= 0) return false;

    const hasImpossibleFastStation =
      row.seg.type === "station"
      && Number.isFinite(athleteSeconds)
      && athleteSeconds > 0
      && comparisonSeconds >= 30
      && athleteSeconds <= Math.min(10, comparisonSeconds * 0.1);
    const hasRoxZoneOutlier =
      row.key === "roxzone_time"
      && row.gap > 0
      && row.gap > 2.5 * comparisonSeconds;
    return hasImpossibleFastStation || hasRoxZoneOutlier;
  }

  const workGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
  const runGap = Number.isFinite(runGapRaw) ? runGapRaw : 0;

  function topLevelGapReconciliationAnomaly() {
    if (hasGoalGroup) return null;
    const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup);
    const roxGap = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup);
    const runningGap = penaltiesAreMaterial && Number.isFinite(runGapNetOfPenalties)
      ? runGapNetOfPenalties
      : runGapRaw;
    if (![totalGapSeconds, stationGap, runningGap, roxGap].every(Number.isFinite) || totalGapSeconds <= 0) return null;

    const runNettedSeconds = Number.isFinite(runGapRaw) ? runGapRaw - runningGap : 0;
    const reconciledVisibleGap = stationGap + runningGap + roxGap + runNettedSeconds;
    const discrepancySeconds = Math.abs(totalGapSeconds - reconciledVisibleGap);
    const toleranceSeconds = Math.max(TOP_LEVEL_GAP_RECONCILIATION_BLOCK_SECONDS, totalGapSeconds * 0.5);
    return discrepancySeconds > toleranceSeconds
      ? { discrepancySeconds, reconciledVisibleGap, totalGapSeconds }
      : null;
  }

  const anomalousSplitRows = [
    ...SPLIT_TABLE_RACE_ORDER.map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) })),
    { key: "roxzone_time", seg: segMap.get("roxzone_time"), gap: splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) },
  ].filter(isAnomalousSplitRow);
  const unreconciledTotalAnomaly = topLevelGapReconciliationAnomaly();
  const hasDataAnomaly = anomalousSplitRows.length > 0 || Boolean(unreconciledTotalAnomaly);
  const hasNarrativeDataAnomaly = anomalousSplitRows.some(isNarrativeBlockingSplitRow) || Boolean(unreconciledTotalAnomaly);
  const dataAnomalySentence = hasNarrativeDataAnomaly
    ? " Treat the limiter ranking as directional until those times are checked."
    : "";

  const rankedGaps = SPLIT_TABLE_RACE_ORDER
    .map((key) => {
      const seg = segMap.get(key);
      return { key, seg, gap: splitOpportunityGap(seg) };
    })
    .filter((row) => row.seg?.label && Number.isFinite(row.gap) && row.gap > 0)
    .sort(compareOpportunityRows);
  const top1 = rankedGaps[0]?.key ?? null;
  const top2 = rankedGaps[1]?.key ?? null;
  const top3 = rankedGaps[2]?.key ?? null;

  function splitRowBgNew(gap) {
    if (!Number.isFinite(gap)) return "#ffffff";
    if (gap < 0) return "#f0fdf4";
    if (isEliteBenchmark && !hasGoalGroup && gap < 90) return "#fffdf7";
    if (gap >= 90) return "#fff4f4";
    if (gap >= 20) return "#fffdf7";
    return "#ffffff";
  }

  function renderSplitHeader() {
    return "";
  }

  function buildGapRelationSentence(stationGap, runGapRawValue, totalGapSecondsValue, bandLabel = null, prefixOverride = null) {
    if (!Number.isFinite(totalGapSecondsValue) || totalGapSecondsValue <= 0) return "";
    if (!Number.isFinite(stationGap)) return "";

    const prefix = prefixOverride ?? (bandLabel ? `Against the ${bandLabel} benchmark median, ` : "");
    const your = prefix ? "your" : "Your";
    const both = prefix ? "both" : "Both";
    const stations = prefix ? "stations" : "Stations";
    const ref = bandLabel ? "benchmark" : (hasGoalGroup ? "target profile" : "benchmark");
    const refPhrase = bandLabel ? `vs the ${ref} median` : `vs the ${ref}`;
    const stationStr = splitGapDisplay(stationGap);
    const runStr = splitGapDisplay(runGapRawValue);
    const totalStr = splitGapDisplay(totalGapSecondsValue);

    if (stationGap < 0) {
      if (Number.isFinite(runGapRawValue) && runGapRawValue >= 60) {
        return ` ${prefix}Running pace is the main gap at <strong style="color:#0f172a;">${splitSafe(runStr)}</strong>. ${your.charAt(0).toUpperCase() + your.slice(1)} station time is already ahead of the ${ref}.`;
      }
      return ` ${prefix}${your.charAt(0).toUpperCase() + your.slice(1)} station time is already ahead of the ${ref}.`;
    }
    if (Number.isFinite(runGapRawValue) && runGapRawValue < 0) {
      return ` ${prefix}${your} largest positive gap is stations: <strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>. Running is ahead of the ${ref} by <strong style="color:#22c55e;">${splitSafe(runStr)}</strong>, which is why the total gap ${refPhrase} is only <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong>.`;
    }
    if (Number.isFinite(runGapRawValue) && runGapRawValue >= 60) {
      return ` ${prefix}${both} stations (<strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>) and running (<strong style="color:#0f172a;">${splitSafe(runStr)}</strong>) are contributing, for a total gap of <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong> ${refPhrase}.`;
    }
    if (Number.isFinite(runGapRawValue) && runGapRawValue > stationGap) {
      return ` ${prefix}${prefix ? "running" : "Running"} is the largest contributor at <strong style="color:#0f172a;">${splitSafe(runStr)}</strong>. ${stations} are also contributing <strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>, for a total gap of <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong> ${refPhrase}.`;
    }
    return ` ${prefix}${stations} are the largest contributor at <strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>, for a total gap of <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong> ${refPhrase}.`;
  }

  function renderRaceStorySummary() {
    const roxGap = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    if (penaltiesAreMaterial) {
      const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup);
      const fitnessLosses = SPLIT_TABLE_RACE_ORDER
        .map((key) => ({ key, seg: segMap.get(key), gap: splitOpportunityGap(segMap.get(key)) }))
        .filter((row) => row.seg?.type === "station" && isConfidentSegment(row.seg) && Number.isFinite(row.gap) && row.gap >= 60)
        .sort(compareOpportunityRows)
        .slice(0, 3);
      const fitnessNames = fitnessLosses.map((row) => row.seg?.label ?? row.key);
      const fitnessSentence = fitnessNames.length
        ? ` Biggest fitness opportunities: ${fitnessNames.join(", ").replace(/, ([^,]*)$/, " and $1")}. Fastest controllable win: penalties.`
        : " Fastest controllable win: penalties.";
      const roxRef = hasGoalGroup ? "target profile" : "benchmark";
      const roxNote = roxGap < -30
        ? `Your RoxZone execution is a clear strength (${splitSafe(splitGapDisplay(roxGap))} vs ${roxRef}).`
        : roxGap < 30
          ? "Transitions are not a meaningful drag on your result."
          : `Transitions are also contributing (~${splitSafe(formatGain(roxGap))} above ${roxRef}).`;
      const gapSentence = buildGapRelationSentence(
        stationGap,
        runGapRaw,
        totalGapSeconds,
        hasGoalGroup ? null : bandDisplayLabel(gapComparisonBand),
        hasGoalGroup ? "Against the target profile, " : null,
      );
      const safeGapSentence = hasNarrativeDataAnomaly ? "" : gapSentence;
      const hasRunGapData = Number.isFinite(runGapRaw) && Number.isFinite(runGapNetOfPenalties);
      const runningPenaltySentence = !hasRunGapData
        ? `The <strong>${splitSafe(formatGain(totalPenaltySeconds))}</strong> penalty is execution leakage, but HYROX did not publish enough running data to separate it cleanly from running fitness.`
        : runPenaltySeconds > 0
          ? `Once the <strong>${splitSafe(formatGain(runPenaltySeconds))}</strong> penalty is separated, the running gap drops from <strong>${splitSafe(splitGapDisplay(runGapRaw))}</strong> to <strong>${splitSafe(splitGapDisplay(runGapNetOfPenalties))}</strong>. ${splitSafe(joinWithAnd(runPenaltyLabels))} ${runPenaltyLabels.length > 1 ? "are" : "is"} penalty-inflated, so do not treat the full loss as a running fitness problem.`
          : nonRunPenaltyLabels.length > 0
            ? `The <strong>${splitSafe(formatGain(totalPenaltySeconds))}</strong> penalty is on ${splitSafe(joinWithAnd(nonRunPenaltyLabels))}, not running - treat it as station execution leakage, separate from your running fitness.`
            : `The <strong>${splitSafe(formatGain(totalPenaltySeconds))}</strong> penalty is execution leakage, separate from running fitness.`;
      const penaltyLeadSentence = hasNarrativeDataAnomaly
        ? "One or more split values look unusual, so check the race splits before naming a main limiter. Penalties are still a controllable win."
        : `${hasGoalGroup ? "Stations remain the largest target gap" : "Stations remain the largest fitness limiter"}, but penalties are your fastest controllable win.`;
      return `<tr>
        <td style="background-color:#ffffff;padding:18px 24px;">
          <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 24px;">
            <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">MAIN INSIGHT</span>
            <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;margin:0;">${splitSafe(penaltyLeadSentence)}${splitSafe(dataAnomalySentence)}${safeGapSentence}<br><br>${runningPenaltySentence}<br><br>${splitSafe(`${roxNote}${fitnessSentence}`)}</p>
          </div>
        </td>
      </tr>`;
    }

    const isElite = achievedBand === "sub_60" || isSub60Finish;
    const isCompetitive = ["sub_65", "sub_70"].includes(achievedBand ?? "");
    const nextBandStr = analysisJson.benchmarkContext?.nextBand?.replace("sub_", "sub-") ?? null;
    const achievedStr = achievedBand?.replace("sub_", "sub-") ?? null;
    // Use the email's own ranked-gap order so Main Insight and Biggest Opportunities always agree.
    const limiterStr = rankedGaps[0] ? (segMap.get(rankedGaps[0].key)?.label ?? analysisJson.headline?.biggestLimiter?.label ?? null) : (analysisJson.headline?.biggestLimiter?.label ?? null);
    const stationLimiterStr = rankedGaps.find((row) => row.seg?.type === "station")?.seg?.label ?? null;
    const runLimiterStr = rankedGaps.find((row) => row.seg?.type === "run")?.seg?.label ?? null;
    const runIsStrength = runGapRaw < -30;
    const targetTimeFmt2 = hasGoalGroup
      ? formatTime(goalGroup?.targetFinishSeconds ?? segMap.get("total_time")?.goalBenchmarkSeconds)
      : null;
    let mainLimiter;
    if (totalGapSeconds <= 0) {
      if (hasGoalGroup) {
        mainLimiter = `You are at or ahead of the ${targetTimeFmt2 ?? "target"} profile. ${
          limiterStr ? `${limiterStr} ${pluralStation(limiterStr) ? "are" : "is"} the tightest remaining gap versus the target.` : ""
        }`.trim();
      } else if (isElite) {
        mainLimiter = workGap > runGap + 60
          ? "You matched or beat your benchmark band overall. Your next refinement is station execution."
          : runGap > workGap + 60
            ? "You matched or beat your benchmark band overall. Your next refinement is run consistency."
            : "You matched or beat your benchmark band overall.";
      } else if (isCompetitive && achievedStr && nextBandStr) {
        if (stationLimiterStr && runIsStrength) {
          mainLimiter = `You are already ahead of the ${achievedStr} benchmark overall. Running is a strength, so the move toward ${nextBandStr} is station efficiency, led by ${stationLimiterStr}${roxGap < -30 ? "" : ", plus cleaner RoxZone flow"}.`;
        } else if (runIsStrength) {
          mainLimiter = `You are already ahead of the ${achievedStr} benchmark overall. Running is a strength, so the move toward ${nextBandStr} is station efficiency${roxGap < -30 ? "." : ", plus cleaner RoxZone flow."}`;
        } else if (limiterStr) {
          mainLimiter = `You matched or beat the ${achievedStr} benchmark. ${limiterStr} shows the clearest gap versus ${nextBandStr} athletes.`;
        } else {
          mainLimiter = `You matched or beat the ${achievedStr} benchmark overall. The next step is ${nextBandStr}.`;
        }
      } else {
        mainLimiter = workGap > runGap + 60
          ? "You matched or beat your benchmark band overall. Station performance is the main area for further improvement."
          : runGap > workGap + 60
            ? "You matched or beat your benchmark band overall. Running pace is the main area for further improvement."
            : "You matched or beat your benchmark band overall.";
      }
    } else if (workGap > runGap + 60) {
      if (hasGoalGroup) {
        mainLimiter = targetTimeFmt2
          ? `To hit ${targetTimeFmt2}, the gap is led by station performance.${limiterStr ? ` ${limiterStr} ${pluralStation(limiterStr) ? "are" : "is"} the biggest target opportunity.` : ""}`
          : `The main target gap is station performance.${stationLimiterStr ? ` ${stationLimiterStr} leads.` : ""}`;
      } else if (isElite) {
        mainLimiter = "Your smallest relative advantage sits in station performance.";
      } else if (isCompetitive && achievedStr && nextBandStr) {
        mainLimiter = `You are competitive in the ${achievedStr} benchmark band. ${
          stationLimiterStr
            ? `Your clearest gap toward ${nextBandStr} is station performance, especially ${stationLimiterStr}.`
            : `Your clearest gap toward ${nextBandStr} is station performance.`
        }`;
      } else {
        mainLimiter = "The main limiter is station performance.";
      }
    } else if (runGap > workGap + 60) {
      if (hasGoalGroup) {
        mainLimiter = targetTimeFmt2
          ? `To hit ${targetTimeFmt2}, the gap is led by running pace.${limiterStr ? ` ${limiterStr} ${pluralStation(limiterStr) ? "are" : "is"} the biggest target opportunity.` : ""}${runIsStrength ? " Running is strong against your current benchmark, but still needs time against the target profile." : ""}`
          : `The main target gap is running pace.${runLimiterStr ? ` ${runLimiterStr} leads.` : ""}`;
      } else if (isElite) {
        mainLimiter = "Your smallest relative advantage sits in running pace.";
      } else if (isCompetitive && achievedStr && nextBandStr) {
        mainLimiter = `You are competitive in the ${achievedStr} benchmark band. ${
          runLimiterStr
            ? `Your clearest gap toward ${nextBandStr} is running pace, especially ${runLimiterStr}.`
            : `Running pace shows the clearest gap versus ${nextBandStr} athletes.`
        }`;
      } else {
        mainLimiter = "The main limiter is running pace.";
      }
    } else {
      if (hasGoalGroup) {
        if (workGap <= 0 && runGap > 0) {
          mainLimiter = targetTimeFmt2
            ? `Your station time is already at or ahead of the target profile. To hit ${targetTimeFmt2}, the remaining gap comes from running pace.`
            : "Your station time is already ahead of the target profile.";
        } else if (runGap <= 0 && workGap > 0) {
          mainLimiter = targetTimeFmt2
            ? `Your running is already ahead of the target profile. To hit ${targetTimeFmt2}, the remaining gap is in station performance.`
            : "Your running is already ahead of the target profile.";
        } else if (workGap <= 0 && runGap <= 0) {
          mainLimiter = targetTimeFmt2
            ? `Your station time and running are already at or ahead of the target profile. To hit ${targetTimeFmt2}, check the remaining transition and split-detail gaps.`
            : "Your station time and running are already ahead of the target profile.";
        } else {
          mainLimiter = targetTimeFmt2
            ? `To hit ${targetTimeFmt2}, both stations and running are contributing to the gap.${penaltiesAreMaterial ? " The first controllable win is penalty removal." : ""}`
            : "Both stations and running are contributing to the target gap.";
        }
      } else {
        if (workGap <= 0 && runGap > 0) {
          mainLimiter = "Your station performance is ahead of the benchmark. Running pace is the main area to improve.";
        } else if (runGap <= 0 && workGap > 0) {
          mainLimiter = "Your running is ahead of the benchmark. Station performance is the main area to improve.";
        } else if (workGap <= 0 && runGap <= 0) {
          mainLimiter = "Your station performance and running are both ahead of the benchmark.";
        } else {
          mainLimiter = "Both running and station performance are contributing to the gap vs the benchmark.";
        }
      }
    }

    if (hasGoalGroup && totalGapSeconds > 0) {
      let feasibility;
      const isEliteTarget = isElite
        && Number.isFinite(goalGroup?.targetFinishSeconds)
        && goalGroup.targetFinishSeconds <= 3300;
      if (isEliteTarget) {
        feasibility = "Target assessment: elite stretch.";
      } else
      if (totalGapSeconds <= 60) feasibility = "Target assessment: very close — within reach with focused execution.";
      else if (totalGapSeconds <= 180) feasibility = "Target assessment: realistic with focused execution.";
      else if (totalGapSeconds <= 360) feasibility = "Target assessment: meaningful stretch.";
      else if (totalGapSeconds <= 600) feasibility = "Target assessment: aggressive stretch.";
      else feasibility = "Target assessment: very aggressive target.";

      if (penaltiesDominate) {
        feasibility = "Target assessment: aggressive stretch. The first win is execution — removing penalties changes the size of the problem immediately.";
      }
      mainLimiter = `${feasibility} ${mainLimiter}`;
    }
    if (hasNarrativeDataAnomaly) {
      mainLimiter = "One or more split values look unusual, so check the race splits before naming a main limiter.";
    }

    const roxRef = hasGoalGroup ? "target profile" : "benchmark";
    const roxNote = roxGap < -30
      ? ` Your RoxZone execution is a clear strength (${splitSafe(splitGapDisplay(roxGap))} vs ${roxRef}).`
      : roxGap < 30
        ? " Transitions are not a meaningful drag on your result."
        : ` Transitions are also contributing (~${splitSafe(formatGain(roxGap))} above ${roxRef}).`;
    const topLosses = SPLIT_TABLE_RACE_ORDER
      .map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
      .filter((row) => Number.isFinite(row.gap) && row.gap >= 60 && isConfidentSegment(row.seg))
      .sort(compareOpportunityRows)
      .slice(0, 3);
    const lossNames = topLosses.map((row) => row.seg?.label ?? row.key).join(", ");
    const biggestNote = lossNames ? ` Biggest opportunities: ${lossNames}.` : "";

    const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup);
    const gapSentence = buildGapRelationSentence(
      stationGap,
      runGapRaw,
      totalGapSeconds,
      hasGoalGroup ? null : bandDisplayLabel(gapComparisonBand),
      hasGoalGroup ? "Against the target profile, " : null,
    );
    const safeGapSentence = hasNarrativeDataAnomaly ? "" : gapSentence;
    const secondParagraph = splitSafe(enforceTone(`${roxNote.trim()}${biggestNote}`));
    // Unreachable when penaltiesAreMaterial is true: the branch above (line ~1327) always
    // returns first in that case. Kept as-is (matching pre-existing dead-code shape) rather
    // than rewritten, since it has no observable effect either way.
    let penaltySentence = "";
    if (penaltiesAreMaterial) {
      const rawGapStr = splitSafe(splitGapDisplay(runGapRaw));
      const netGapStr = splitSafe(splitGapDisplay(runGapNetOfPenalties));
      const penStr = splitSafe(formatGain(totalPenaltySeconds));
      penaltySentence = ` Penalties are your fastest controllable win &mdash; once the <strong>${penStr}</strong> penalty is separated, the running gap drops from <strong>${rawGapStr}</strong> to <strong>${netGapStr}</strong>.`;
    }

    return `<tr>
      <td style="background-color:#ffffff;padding:18px 24px;">
        <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 24px;">
          <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">MAIN INSIGHT</span>
          <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;margin:0;">${splitSafe(enforceTone(mainLimiter))}${splitSafe(dataAnomalySentence)}${safeGapSentence}${penaltySentence}<br><br>${secondParagraph}</p>
        </div>
      </td>
    </tr>`;
  }

	  function renderGapBreakdown() {
	    if (totalGapSeconds <= 0) return "";
		    const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
		    const stationForBar = Math.max(0, stationGap);
	    const penaltyForBar = penaltiesAreMaterial ? totalPenaltySeconds : 0;
		    const runningGap = penaltiesAreMaterial ? runGapNetOfPenalties : runGapRaw;
		    const runningForBar = Math.max(0, runningGap);
	    const roxGap = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
	    const roxForBar = Math.max(0, roxGap);
		    const positiveTotal = stationForBar + penaltyForBar + runningForBar + roxForBar;
		    const stationPct = positiveTotal > 0 ? Math.round((stationForBar / positiveTotal) * 100) : 0;
	    const penaltyPct = positiveTotal > 0 ? Math.round((penaltyForBar / positiveTotal) * 100) : 0;
	    const runningPct = Math.max(0, Math.min(100 - stationPct - penaltyPct, positiveTotal > 0 ? Math.round((runningForBar / positiveTotal) * 100) : 0));
	    const roxPct = Math.max(0, Math.min(100 - stationPct - penaltyPct - runningPct, positiveTotal > 0 ? Math.round((roxForBar / positiveTotal) * 100) : 0));
		    function profileGapColor(segmentKey, gap) {
		      if (!Number.isFinite(gap) || Math.abs(gap) <= 5) return "#94a3b8";
		      if (gap < 0) return "#22c55e";
		      // Running always gets blue so it is visually distinct from stations at any gap size
		      if (segmentKey === "run_time") return gap > 60 ? "#2563eb" : "#3b82f6";
		      if (segmentKey === "roxzone_time") return "#f59e0b";
		      if (isEliteBenchmark && !hasGoalGroup && gap < 180) return "#d97706";
		      return gap > 60 ? "#e53e3e" : "#d97706";
		    }
		    const stationSeverityColor = profileGapColor("work_time", stationGap);
		    const runningSeverityColor = profileGapColor("run_time", runningGap);
		    const roxSeverityColor = profileGapColor("roxzone_time", roxGap);
	    const penaltyBarCell = penaltiesAreMaterial && penaltyPct > 0
	      ? `<td width="${penaltyPct}%" style="background-color:#7c3aed;font-size:1px;line-height:14px;">&nbsp;</td>`
	      : "";
	    const runningBarCell = runningForBar > 0 && runningPct > 0
	      ? `<td width="${runningPct}%" style="background-color:${runningSeverityColor};font-size:1px;line-height:14px;">&nbsp;</td>`
	      : "";
	    const roxBarCell = roxForBar > 0 && roxPct > 0
	      ? `<td width="${roxPct}%" style="background-color:${roxSeverityColor};font-size:1px;line-height:14px;">&nbsp;</td>`
	      : "";
	    const penaltyLegendItem = penaltiesAreMaterial
	      ? `<span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:#7c3aed;margin-right:5px;"></span>Penalties ${splitSafe(splitGapDisplay(totalPenaltySeconds))}</span>`
	      : "";
		    const runningLabel = Number.isFinite(runningGap)
		      ? runPenaltySeconds > 0
		        ? `Running ${splitSafe(splitGapDisplay(runGapNetOfPenalties))} net of penalties`
	        : `Running ${splitSafe(splitGapDisplay(runGapRaw))}`
		      : "Running unavailable";
    const gapBandRef = !hasGoalGroup && gapComparisonBand && gapComparisonBand !== achievedBand
      ? `${bandDisplayLabel(gapComparisonBand)} benchmark`
      : "benchmark";
    const footerSentence = runPenaltySeconds > 0
      ? (hasGoalGroup
        ? "Running is shown net of penalties. Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap."
        : `Running is shown net of penalties so fitness and execution are not conflated. Segment gaps are each measured against the ${gapBandRef} median for that segment, so they may not sum exactly to the total race gap.`)
      : penaltiesAreMaterial
        ? (hasGoalGroup
          ? "Penalties are shown separately from performance gaps. Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap."
          : `Penalties are shown separately from performance gaps. Segment gaps are each measured against the ${gapBandRef} median for that segment, so they may not sum exactly to the total race gap.`)
        : (hasGoalGroup
          ? "Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap."
          : `Segment gaps are each measured against the ${gapBandRef} median for that segment, so they may not sum exactly to the total race gap.`);
    const footerNote = `<p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 0 0;line-height:1.5;">${footerSentence}</p>`;

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="border:1px solid #e2e8f0;border-radius:8px;background-color:#ffffff;padding:16px;">
          <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">SEGMENT PROFILE</span>
	          <span style="display:block;color:#94a3b8;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;margin-bottom:10px;">${hasGoalGroup ? "vs. target profile per segment" : gapComparisonBand && gapComparisonBand !== achievedBand ? `vs. ${bandDisplayLabel(gapComparisonBand)} median per segment` : "vs. band median per segment"}</span>
	          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="height:14px;background-color:#f1f5f9;overflow:hidden;margin:0 0 12px;">
	            <tr>
	              <td width="${stationPct}%" style="background-color:${stationSeverityColor};font-size:1px;line-height:14px;">&nbsp;</td>
	              ${penaltyBarCell}
	              ${runningBarCell}
	              ${roxBarCell}
	            </tr>
	          </table>
	          <p style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#475569;line-height:1.7;margin:0;">
	            <span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:${stationSeverityColor};margin-right:5px;"></span>Stations ${splitSafe(splitGapDisplay(stationGap))}</span>
	            ${penaltyLegendItem}
	            <span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:${runningSeverityColor};margin-right:5px;"></span>${runningLabel}</span>
	            <span style="white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;background-color:${roxSeverityColor};margin-right:5px;"></span>RoxZone ${splitSafe(splitGapDisplay(roxGap))}</span>
	          </p>
          ${footerNote}
        </div>
      </td>
    </tr>`;
  }

	  function renderSummaryCards() {
    const roxGapForCard = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    const stationGapForCard = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
    const runGapForCard = splitGapSeconds(segMap.get("run_time"), hasGoalGroup);
    const totalGapNote = hasGoalGroup ? "vs target" : "vs benchmark median";
    const cardsGapBandRef = !hasGoalGroup && gapComparisonBand && gapComparisonBand !== achievedBand
      ? `${bandDisplayLabel(gapComparisonBand)} benchmark`
      : "benchmark";
    const cardsFooterNote = `<p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 0 0;line-height:1.5;">${hasGoalGroup ? "Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap." : `Segment gaps are each measured against the ${cardsGapBandRef} median for that segment, so they may not sum exactly to the total race gap.`}</p>`;

    function segmentCardNote(gap) {
      if (!Number.isFinite(gap)) return hasGoalGroup ? "vs target" : "vs benchmark";
      if (hasGoalGroup) {
        if (gap <= -10) return "Ahead of target";
        if (gap <= 20) return "On target";
        if (gap < 60) return "Close to target";
        return "Opportunity";
      }
      if (gap <= -10) return "Strength";
      if (gap <= 10) return "On benchmark";
      return "Opportunity";
    }

    function largestPositiveSegmentKey(keys) {
      let best = null;
      let bestGap = 10;
      for (const key of keys) {
        const seg = segMap.get(key);
        const gap = splitGapSeconds(seg, hasGoalGroup) ?? -Infinity;
        if (gap > bestGap) {
          bestGap = gap;
          best = key;
        }
      }
      return best;
    }

    const mainSegKey = largestPositiveSegmentKey(["work_time", "run_time", "roxzone_time"]);

    function cardNote(key, gap) {
      const base = segmentCardNote(gap);
      if (base === "Opportunity" && key === mainSegKey) return "Main opportunity";
      return base;
    }

    const cards = [
      { key: "total_time", label: "Race time", note: totalGapNote },
      { key: "work_time", label: "Stations", note: segMap.has("work_time") ? cardNote("work_time", stationGapForCard) : "Unavailable" },
      { key: "run_time", label: "Running", note: segMap.has("run_time") ? cardNote("run_time", runGapForCard) : "Unavailable" },
      { key: "roxzone_time", label: "RoxZone", note: cardNote("roxzone_time", roxGapForCard) },
    ];

    function card(cfg) {
      const seg = segMap.get(cfg.key);
      const gap = splitGapSeconds(seg, hasGoalGroup);
      const timeStr = seg && Number.isFinite(seg.userSeconds) ? splitSafe(formatTime(seg.userSeconds)) : "&ndash;";
      const pill = Number.isFinite(gap) ? gapPill(gap) : "";
      return `<div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
        <span style="display:block;color:#94a3b8;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${splitSafe(cfg.label)}</span>
        <span style="display:block;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${timeStr}</span>
        ${pill}
        <span style="display:block;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;margin-top:6px;">${splitSafe(cfg.note)}</span>
      </div>`;
    }

    if (penaltiesAreMaterial) {
      function penaltyPill(gap) {
        if (!Number.isFinite(gap)) return "";
        return `<span style="display:inline-block;background-color:#ede9fe;color:#7c3aed;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:3px;">${splitSafe(splitGapDisplay(gap))}</span>`;
      }

      function explicitCard(label, timeStr, gap, note, pillOverride = null) {
        const pill = pillOverride ?? (Number.isFinite(gap) ? gapPill(gap) : "");
        return `<div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
          <span style="display:block;color:#94a3b8;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${splitSafe(label)}</span>
          <span style="display:block;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${splitSafe(timeStr)}</span>
          ${pill}
          <span style="display:block;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;margin-top:6px;">${splitSafe(note)}</span>
        </div>`;
      }

      const totalSeg = segMap.get("total_time");
      const stationSeg = segMap.get("work_time");
      const runSeg = segMap.get("run_time");
      const roxSeg = segMap.get("roxzone_time");
      const timeFor = (seg) => seg && Number.isFinite(seg.userSeconds) ? formatTime(seg.userSeconds) : "&ndash;";
      const adjustedTime = Number.isFinite(adjustedRaceTimeSeconds) ? formatTime(adjustedRaceTimeSeconds) : "&ndash;";
      const stationGap = splitGapSeconds(stationSeg, hasGoalGroup);
      const roxGap = splitGapSeconds(roxSeg, hasGoalGroup);

      return `
      <tr>
        <td style="background-color:#ffffff;padding:0 24px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td width="50%" valign="top" style="padding:0 4px 8px 0;">${explicitCard("Race time", timeFor(totalSeg), totalGapSeconds, totalGapNote)}</td>
              <td width="50%" valign="top" style="padding:0 0 8px 4px;">${explicitCard("Adjusted", adjustedTime, adjustedGapSeconds, "Without penalties", penaltyPill(adjustedGapSeconds))}</td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding:0 4px 8px 0;">${explicitCard("Stations", timeFor(stationSeg), stationGap, stationSeg ? cardNote("work_time", stationGap) : "Unavailable")}</td>
              <td width="50%" valign="top" style="padding:0 0 8px 4px;">${explicitCard("Penalties", formatTime(totalPenaltySeconds), totalPenaltySeconds, "Fastest win", penaltyPill(totalPenaltySeconds))}</td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding:0 4px 0 0;">${explicitCard("Running", timeFor(runSeg), runGapNetOfPenalties, runSeg ? (runPenaltySeconds > 0 ? "Net of penalties" : cardNote("run_time", runGapNetOfPenalties)) : "Unavailable")}</td>
              <td width="50%" valign="top" style="padding:0 0 0 4px;">${explicitCard("RoxZone", timeFor(roxSeg), roxGap, cardNote("roxzone_time", roxGap))}</td>
            </tr>
          </table>
          ${cardsFooterNote}
        </td>
      </tr>`;
    }

    return `
    <tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td width="50%" valign="top" style="padding:0 4px 8px 0;">${card(cards[0])}</td>
            <td width="50%" valign="top" style="padding:0 0 8px 4px;">${card(cards[1])}</td>
          </tr>
          <tr>
            <td width="50%" valign="top" style="padding:0 4px 0 0;">${card(cards[2])}</td>
            <td width="50%" valign="top" style="padding:0 0 0 4px;">${card(cards[3])}</td>
          </tr>
        </table>
        ${cardsFooterNote}
      </td>
	    </tr>`;
	  }

  function renderTargetRoadmap() {
    if (!hasGoalGroup || totalGapSeconds <= 0) return "";
    const targetTimeFmt = formatTime(goalGroup?.targetFinishSeconds ?? segMap.get("total_time")?.goalBenchmarkSeconds);
    if (!targetTimeFmt) return "";

    const totalGapStr = formatGain(totalGapSeconds);
    const stationGap2 = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
    const roxGap2 = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    const runGapForRoute = penaltiesAreMaterial ? runGapNetOfPenalties : runGapRaw;
    const stationRanked = rankedGaps.filter((r) => segMap.get(r.key)?.type === "station");
    const runRanked = rankedGaps.filter((r) => segMap.get(r.key)?.type === "run");
    const topStationLabel = stationRanked[0] ? (segMap.get(stationRanked[0].key)?.label ?? stationRanked[0].key) : null;
    const top2StationLabel = stationRanked[1] ? (segMap.get(stationRanked[1].key)?.label ?? stationRanked[1].key) : null;
    const topRunLabel = runRanked[0] ? (segMap.get(runRanked[0].key)?.label ?? runRanked[0].key) : null;

    // When a component is already ahead of target, its advantage offsets what running needs to cover.
    const stationCredit = Math.max(0, -stationGap2);
    const roxCredit = Math.max(0, -roxGap2);
    const effectiveRunRequirement = Number.isFinite(runGapForRoute)
      ? Math.max(0, runGapForRoute)
      : 0;
    const hasStationCredit = stationCredit > 60;
    const hasRoxCredit = roxCredit > 60;

    const runningUnavailable = !Number.isFinite(runGapForRoute);
    if (runningUnavailable && stationGap2 > totalGapSeconds + 60) {
      const stationGapStr = splitSafe(formatGain(Math.round(stationGap2)));
      const totalGapStr2 = splitSafe(formatGain(totalGapSeconds));
      const targetTimeFmtSafe = splitSafe(targetTimeFmt);
      return `<tr>
        <td style="background-color:#ffffff;padding:0 24px 18px;">
          <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:18px 24px;">
            <span style="display:block;color:#0369a1;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">YOUR ROUTE TO ${targetTimeFmtSafe}</span>
            <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0;">A full route breakdown requires running split data, which was not available for this result. Station performance accounts for at least ${stationGapStr} of the ${totalGapStr2} gap — the route allocation will be shown once running splits are available.</p>
          </div>
        </td>
      </tr>`;
    }

    const routeItems = [];

    if (penaltiesAreMaterial && totalPenaltySeconds > 0) {
      routeItems.push(`${splitSafe(formatGain(totalPenaltySeconds))} from eliminating penalties`);
    }

    if (stationGap2 > 30) {
      const stationBullet = topStationLabel
        ? `${splitSafe(formatGain(Math.round(stationGap2)))} from station efficiency, led by ${splitSafe(topStationLabel)}${top2StationLabel ? ` and ${splitSafe(top2StationLabel)}` : ""}`
        : `${splitSafe(formatGain(Math.round(stationGap2)))} from station efficiency`;
      routeItems.push(stationBullet);
    }

    if (effectiveRunRequirement > 30) {
      const runBullet = topRunLabel
        ? `around ${splitSafe(formatGain(effectiveRunRequirement))} from running pace, especially ${splitSafe(topRunLabel)}`
        : `around ${splitSafe(formatGain(effectiveRunRequirement))} from running pace against the target profile`;
      routeItems.push(runBullet);
    } else if (runGapRaw < -30) {
      routeItems.push("protect running – already ahead of the target profile");
    }

    const hasLateRoxzoneDrift = (analysisJson.roxzoneAnalysis?.roxzoneNarrative?.scenarioTags ?? []).includes("late_race_drift")
      || analysisJson.roxzoneAnalysis?.entryTrend === "rising"
      || analysisJson.roxzoneAnalysis?.exitTrend === "rising";
    if (roxGap2 > 20) {
      routeItems.push(`around ${splitSafe(formatGain(roxGap2))} from cleaner RoxZone transitions`);
    } else if (roxGap2 < -20) {
      routeItems.push(hasLateRoxzoneDrift
        ? "protect overall RoxZone - already ahead of target, with late-race flow polish"
        : "protect RoxZone - already ahead of target");
    }

    if (routeItems.length === 0) return "";

    const listItems = routeItems.slice(0, 3).map((item) =>
      `<li style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;color:#475569;line-height:1.6;margin-bottom:4px;">${item}</li>`
    ).join("");

    const offsetNote = (hasStationCredit || hasRoxCredit)
      ? `<p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:10px 0 0;font-style:italic;">${hasStationCredit ? "Your station time is already ahead of the target profile" : "Your RoxZone time is already ahead of the target profile"} — this offsets some of the running gap needed.</p>`
      : "";

    const headingText = `YOUR ROUTE TO ${splitSafe(targetTimeFmt)}`;

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:18px 24px;">
          <span style="display:block;color:#0369a1;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">${headingText}</span>
          <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0 0 10px;">You need to find <strong>${splitSafe(totalGapStr)}</strong> overall. The most realistic route is:</p>
          <ul style="margin:0;padding-left:20px;">
            ${listItems}
          </ul>
          ${offsetNote}
        </div>
      </td>
    </tr>`;
  }

  function renderTargetPriorities() {
    if (!hasGoalGroup) return "";

    const stationGap2 = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
    const roxGap2 = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    const top1Label = top1 ? (segMap.get(top1)?.label ?? null) : null;

    const protectItems = [];
    if (runGapRaw < -30) protectItems.push("running pace - already ahead of the target profile");
	    const hasLateRoxzoneDrift = (analysisJson.roxzoneAnalysis?.roxzoneNarrative?.scenarioTags ?? []).includes("late_race_drift")
	      || analysisJson.roxzoneAnalysis?.entryTrend === "rising"
	      || analysisJson.roxzoneAnalysis?.exitTrend === "rising";
	    if (roxGap2 < -20) protectItems.push(hasLateRoxzoneDrift
	      ? "overall RoxZone execution - ahead of the target profile, but protect late-race flow"
	      : "RoxZone execution - already ahead of the target profile");

    const changeItems = [];
    if (penaltiesAreMaterial) changeItems.push(`penalties - ${splitSafe(formatGain(totalPenaltySeconds))} of execution leakage`);
    if (top1Label && stationGap2 > 30) changeItems.push(`${splitSafe(top1Label)} and station efficiency`);
    const top2Label = top2 ? (segMap.get(top2)?.label ?? null) : null;
    if (!penaltiesAreMaterial && top2Label && changeItems.length === 0 && !changeItems.some((c) => c.includes(top2Label))) {
      changeItems.push(splitSafe(top2Label));
    }

    const skipItems = [];
    if (runGapRaw < -30) skipItems.push("general running volume - it is already a relative strength");
    if (runPenaltySeconds > 0) skipItems.push(`${splitSafe(joinWithAnd(runPenaltyLabels))} as pure running fitness - ${runPenaltyLabels.length > 1 ? "they are" : "it is"} penalty-inflated`);

    if (protectItems.length === 0 && changeItems.length === 0) return "";

    function listBlock(heading, items, color) {
      if (items.length === 0) return "";
      const itemsHtml = items.map((i) =>
        `<li style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#475569;line-height:1.6;">${i}</li>`
      ).join("");
      return `<p style="margin:8px 0 2px;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${color};">${heading}</p>
        <ul style="margin:0 0 6px;padding-left:16px;">${itemsHtml}</ul>`;
    }

    const body = [
      listBlock("Protect", protectItems.slice(0, 2), "#16a34a"),
      listBlock("Change", changeItems.slice(0, 2), "#d97706"),
      listBlock("Do not over-focus", skipItems.slice(0, 2), "#94a3b8"),
    ].filter(Boolean).join("");

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
          <span style="display:block;color:#92400e;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">TARGET PRIORITIES</span>
          ${body}
        </div>
      </td>
    </tr>`;
  }

  function renderSegmentHighlights() {
    // RoxZone is included alongside station/run splits so a genuinely dominant transition
    // loss (e.g. a tight elite race where every individual split is small) can surface as a
    // biggest opportunity, mirroring the RoxZone strength candidate injected further below.
    const losses = [...SPLIT_TABLE_RACE_ORDER, "roxzone_time"]
      .map((key) => {
        const rawSeg = segMap.get(key);
        const seg = key === "roxzone_time" && rawSeg ? { ...rawSeg, label: "RoxZone" } : rawSeg;
        return {
          key,
          seg,
          gap: splitOpportunityGap(seg),
          adjusted: isPenaltyAdjustedSegment(seg),
        };
      })
	      .filter((row) => {
	        if (!row.seg?.label || !Number.isFinite(row.gap) || row.gap < 30) return false;
	        if (!isConfidentSegment(row.seg)) return false;
	        // In analyse mode (no goal group), exclude segments that are already near the
	        // comparison split time. Eligibility is seconds-gap based, not percentile based.
	        if (!hasGoalGroup && !["Opportunity", "Priority"].includes(splitBandLabel(row.seg, row.gap))) return false;
	        return true;
	      })
      .sort(compareOpportunityRows);
    if (penaltiesAreMaterial) {
      losses.unshift({
        key: "__penalty__",
        seg: { label: "Penalties", percentile: null },
        gap: totalPenaltySeconds,
      });
    }
    const topLosses = losses.slice(0, hasGoalGroup ? 3 : 5);
    const strengthCandidates = SPLIT_TABLE_RACE_ORDER
      .map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
      .filter((row) => row.seg && Number.isFinite(row.gap) && row.gap < 0 && isConfidentSegment(row.seg))
      .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));

    const roxAggregateSeg = segMap.get("roxzone_time");
    const roxAggregateGap = splitGapSeconds(roxAggregateSeg, hasGoalGroup) ?? null;
    if (
      roxAggregateSeg
      && Number.isFinite(roxAggregateGap)
	      && roxAggregateGap < -30
      && isConfidentSegment(roxAggregateSeg)
    ) {
      strengthCandidates.push({
        key: "roxzone_time",
        seg: { ...roxAggregateSeg, label: "RoxZone" },
        gap: roxAggregateGap,
      });
      strengthCandidates.sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
    }
    const suppressedStrengthRows = strengthCandidates.filter(isAnomalousSplitRow);
    const strengths = strengthCandidates.filter((row) => !isAnomalousSplitRow(row));
    const topStrengths = strengths.slice(0, 3);
    const isEliteAthlete = achievedBand === "sub_60";

    const badge = (num) => `<span style="display:inline-block;min-width:20px;text-align:center;background-color:#22d3ee;color:#07101e;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;padding:1px 4px;border-radius:3px;">${num}</span>`;
    const strongPill = `<span style="display:inline-block;background-color:#dcfce7;color:#16a34a;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;text-transform:uppercase;font-weight:700;letter-spacing:0.06em;padding:3px 6px;border-radius:4px;">STRONG</span>`;

    function lossRow(item, idx) {
      const isPenalty = item.key === "__penalty__";
      const rowBadge = isPenalty
        ? `<span style="display:inline-block;min-width:20px;text-align:center;background-color:#7c3aed;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;padding:1px 4px;border-radius:3px;">${idx + 1}</span>`
        : badge(idx + 1);
      const rank = isPenalty
        ? `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#7c3aed;">execution</span>`
        : (() => {
          if (hasGoalGroup) {
            const gapAbs = item.gap ?? 0;
            let targetLabel;
            if (isEliteAthlete) {
              targetLabel = "Elite target refinement";
            } else if (gapAbs >= 120) {
              targetLabel = idx === 0 ? "Main target opportunity" : "Target opportunity";
            } else if (gapAbs >= 30) {
              targetLabel = "Target opportunity";
            } else {
              targetLabel = "On target";
            }
            return `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#d97706;">${splitSafe(targetLabel)}</span>`;
          }
		          const rawLabel = splitBandLabel(item.seg, item.gap);
	          if (!rawLabel) return "";
	          const displayLabel = isEliteAthlete ? eliteBandLabel(rawLabel) : rawLabel;
	          const bsColor = isEliteAthlete && ["Priority", "Opportunity"].includes(rawLabel) ? "#d97706" : bandScoreColor(rawLabel);
	          return `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:${bsColor};">${splitSafe(displayLabel)} vs your benchmark band</span>`;
        })();
      const adjustedNote = item.adjusted
        ? `<span style="display:block;font-family:Inter,Arial,Helvetica,sans-serif;font-size:10px;color:#7c3aed;">penalty-adjusted</span>`
        : "";
      const pillHtml = isPenalty
        ? `<span style="display:inline-block;background-color:#ede9fe;color:#7c3aed;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:3px;">${splitSafe(splitGapDisplay(item.gap))}</span>`
        : gapPill(item.gap);
      return `<tr>
        <td style="padding:8px 0 8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:28px;">${rowBadge}</td>
        <td style="padding:8px 8px 8px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${splitSafe(item.seg.label)}</span>
          ${rank ? `<span style="display:block;">${rank}</span>` : ""}
          ${adjustedNote}
        </td>
        <td style="padding:8px 10px 8px 4px;text-align:right;vertical-align:middle;white-space:nowrap;">${pillHtml}</td>
      </tr>`;
    }

    function strengthRow(item) {
      const rank = (() => {
        if (hasGoalGroup) {
          const targetLabel = item.gap < -10 ? "Ahead of target" : "On target";
          return `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#16a34a;">${splitSafe(targetLabel)}</span>`;
        }
        if (Number.isFinite(item.gap) && item.gap < 0) {
          return `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#16a34a;">Strength vs your benchmark band</span>`;
        }
	        const rawLabel = splitBandLabel(item.seg, item.gap);
        if (!rawLabel) return "";
        const displayLabel = isEliteAthlete ? eliteBandLabel(rawLabel) : rawLabel;
        const bsColor = bandScoreColor(rawLabel);
        return `<span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:${bsColor};">${splitSafe(displayLabel)} vs your benchmark band</span>`;
      })();
      return `<tr>
        <td style="padding:8px 0 8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:58px;">${strongPill}</td>
        <td style="padding:8px 8px 8px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${splitSafe(item.seg.label)}</span>
          ${rank ? `<span style="display:block;">${rank}</span>` : ""}
        </td>
        <td style="padding:8px 10px 8px 4px;text-align:right;vertical-align:middle;white-space:nowrap;">${gapPill(item.gap)}</td>
      </tr>`;
    }

    const lossRows = topLosses.length >= 1
      ? topLosses.map((item, idx) => lossRow(item, idx)).join("")
      : `<tr><td colspan="3" style="padding:12px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-style:italic;">No significant time losses detected.</td></tr>`;
    const strengthFallbackRef = hasGoalGroup ? "target profile" : "benchmark";
    const anomalyGapRef = hasGoalGroup ? "target profile" : "benchmark";
    const strengthRows = topStrengths.length > 0
      ? topStrengths.map((item) => strengthRow(item)).join("")
      : `<tr><td colspan="3" style="padding:12px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-style:italic;">No segments clearly ahead of ${strengthFallbackRef}.</td></tr>`;

    // Flag rows where the gap is implausibly large — over 2.5x the comparison time for that split.
    // This catches likely data entry errors (e.g., athlete typed a wall balls time of 30 min).
    const hasAnomalousGap = hasDataAnomaly || topLosses.some((item) => {
      if (item.key === "__penalty__" || !Number.isFinite(item.gap) || item.gap <= 0) return false;
      const athleteTime = item.seg?.userSeconds ?? item.seg?.timeSeconds;
      if (!Number.isFinite(athleteTime)) return false;
      const benchmarkTime = athleteTime - item.gap;
      return benchmarkTime > 0 && item.gap > 2.5 * benchmarkTime;
    });
    const anomalyNote = hasAnomalousGap
      ? `<tr><td colspan="3" style="padding:6px 12px 8px;"><span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:10px;font-style:italic;color:#f59e0b;">⚠ One or more splits show an unusually large gap vs the ${anomalyGapRef} — double-check those times are entered correctly.</span></td></tr>`
      : "";
    const strengthsAnomalyNote = suppressedStrengthRows.length > 0
      ? `<tr><td colspan="3" style="padding:6px 12px 8px;"><span style="font-family:Inter,Arial,Helvetica,sans-serif;font-size:10px;font-style:italic;color:#f59e0b;">⚠ One or more strong-looking splits are affected by unusual data — double-check those times.</span></td></tr>`
      : "";

    function panelHeader(title, subtitle) {
      return `<tr style="background-color:#f8fafc;">
        <td colspan="3" style="padding:8px 12px 4px;border-bottom:1px solid #e2e8f0;">
          <span style="font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">${splitSafe(title)}</span>
          <span style="display:block;font-family:Inter,Arial,Helvetica,sans-serif;font-size:10px;font-style:italic;color:#94a3b8;margin-top:1px;">${splitSafe(subtitle)}</span>
        </td>
      </tr>`;
    }

    const lossTable = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background-color:#ffffff;">
      ${panelHeader("Biggest opportunities", penaltiesAreMaterial ? "Penalty separated from split performance" : hasGoalGroup ? "Where your target time comes from" : "Where the next time comes from")}
      ${lossRows}
      ${anomalyNote}
    </table>`;
    const strengthTable = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background-color:#ffffff;">
      ${panelHeader("Strengths to protect", hasGoalGroup ? "Areas already ahead of target profile" : "Good areas to preserve")}
      ${strengthRows}
      ${strengthsAnomalyNote}
    </table>`;

    return `
    <tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td width="50%" valign="top" style="padding:0 6px 0 0;">${lossTable}</td>
            <td width="50%" valign="top" style="padding:0 0 0 6px;">${strengthTable}</td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  function pctCells(segment, isAggregate, gap = null) {
    const dash = `<td style="padding:7px 6px;text-align:left;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">&ndash;</td>`;
    // A repaired/estimated split still has a real, non-suppressed benchmark comparison -
    // only the athlete's own time is uncertain, so Comparison/Split status can render (muted)
    // instead of being blanked like a genuinely suppressed (no-benchmark-data) row.
    const isEstimatedOnly = segment.estimated === true && !segment.suppressed;
    if (isAggregate || (segment.confidence === "low" && !isEstimatedOnly)) {
      return `${dash}${dash}`;
    }
    const targetSecs = splitTargetSeconds(segment, hasGoalGroup);
    const targetText = Number.isFinite(targetSecs) ? formatTime(targetSecs) : null;
    const overallCell = targetText
      ? `<td style="padding:7px 6px;text-align:left;font-family:'Courier New',Courier,monospace;font-size:11px;color:#64748b;">${splitSafe(targetText)}</td>`
      : dash;
    let bandScoreCell;
    if (hasGoalGroup) {
      const isEliteBand = achievedBand === "sub_60";
      let targetLabel = null;
      if (Number.isFinite(gap)) {
        if (gap < -10) {
          targetLabel = "Ahead of target";
        } else if (gap <= 30) {
          targetLabel = "On target";
        } else if (isEliteBand) {
          targetLabel = "Elite target refinement";
        } else if (segment.segmentKey === top1) {
          targetLabel = "Main target opportunity";
        } else {
          targetLabel = "Target opportunity";
        }
      }
      const tColor = isEstimatedOnly ? "#94a3b8"
        : !targetLabel ? "#94a3b8"
        : targetLabel === "Ahead of target" ? "#22c55e"
        : targetLabel === "On target" ? "#475569"
        : targetLabel === "Elite target refinement" ? "#6366f1"
        : "#d97706";
      bandScoreCell = targetLabel
        ? `<td style="padding:7px 6px;text-align:left;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;color:${tColor};">${splitSafe(targetLabel)}</td>`
        : dash;
    } else {
      const rawBsLabel = splitBandLabel(segment, gap);
      const bsLabel = isEliteBenchmark && Number.isFinite(gap) && gap > 0 && gap < 90 && rawBsLabel === "Priority"
        ? "Next refinement"
        : isEliteBenchmark && Number.isFinite(gap) && gap > 0 && gap < 90 && rawBsLabel === "Opportunity"
          ? "Refinement"
          : rawBsLabel;
      const bsColor = isEstimatedOnly ? "#94a3b8" : ["Next refinement", "Refinement"].includes(bsLabel) ? "#d97706" : bandScoreColor(rawBsLabel);
      bandScoreCell = bsLabel
        ? `<td style="padding:7px 6px;text-align:left;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;color:${bsColor};">${splitSafe(bsLabel)}</td>`
        : dash;
    }
    return `${overallCell}${bandScoreCell}`;
  }

  function dataRow(segment) {
    const key = segment.segmentKey;
    const rawGap = splitGapSeconds(segment, hasGoalGroup);
    const gap = splitOpportunityGap(segment);
    const penaltyAdjusted = isPenaltyAdjustedSegment(segment);
    const isLowConfidence = segment.confidence === "low";
    // A repaired split is missing RoxZone transition time that would normally be
    // counted separately, so the true station time is lower than the residual shown -
    // "<" (an upper bound) is accurate here where "~" (roughly this value) is not.
    const prefix = segment.estimated === true ? "<" : isLowConfidence ? "~" : "";
    const userT = Number.isFinite(segment.userSeconds) ? `${prefix}${formatTime(segment.userSeconds)}` : "–";
    const gapStr = splitGapDisplay(gap);
    const gapColor = isLowConfidence ? "#94a3b8" : splitGapColor(gap);
    const gapBold = !isLowConfidence && Number.isFinite(gap) && gap > 90 ? "font-weight:700;" : "";
    const userColor = isLowConfidence ? "#94a3b8" : "#0f172a";
    const bg = `background-color:${splitRowBgNew(gap)};`;
    const adjustedUserT = penaltyAdjusted && Number.isFinite(adjustedUserSeconds(segment))
      ? `${prefix}${formatTime(adjustedUserSeconds(segment))}`
      : userT;
    const typeTag = segment.segmentKey?.startsWith("run_")
      ? `<span style="display:inline-block;background-color:#0a2030;color:#22d3ee;font-family:'Inter Tight',Arial,sans-serif;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:0.05em;margin-right:6px;vertical-align:middle;">RUN</span>`
      : `<span style="display:inline-block;background-color:#0a1530;color:#6699ff;font-family:'Inter Tight',Arial,sans-serif;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:0.05em;margin-right:6px;vertical-align:middle;">STN</span>`;

    return `<tr style="${bg}">
      <td style="padding:7px 8px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${typeTag}${splitSafe(segment.label)}${penaltyAdjusted ? `<span style="display:block;font-family:Inter,Arial,Helvetica,sans-serif;font-size:10px;color:#7c3aed;">penalty-adjusted from ${splitSafe(splitGapDisplay(rawGap))}</span>` : ""}</td>
      ${pctCells(segment, false, gap)}
      <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:${userColor};">${splitSafe(adjustedUserT)}</td>
      <td style="padding:7px 12px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;${gapBold}color:${gapColor};">${splitSafe(gapStr)}</td>
    </tr>`;
  }

  const penaltyRowHtml = totalPenaltySeconds > 0
    ? `<tr style="background-color:#f5f3ff;">
        <td style="padding:7px 8px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">Penalties</td>
        <td style="padding:7px 6px;text-align:left;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#7c3aed;">execution</td>
        <td style="padding:7px 6px;text-align:left;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">&ndash;</td>
        <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:#7c3aed;">${splitSafe(formatTime(totalPenaltySeconds))}</td>
        <td style="padding:7px 12px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#7c3aed;">${splitSafe(splitGapDisplay(totalPenaltySeconds))}</td>
      </tr>`
    : "";

  const splitTableRows = SPLIT_TABLE_RACE_ORDER
    .map((key) => {
      const segment = segMap.get(key);
      return segment ? dataRow(segment) : "";
    })
    .join("");

  const splitTableNote = penaltiesAreMaterial
    ? `<p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;line-height:1.45;margin:8px 0 0;">Penalty time is shown separately above, so the split table focuses on performance gaps rather than execution penalties.</p>`
    : "";

  const hasEstimatedSplit = SPLIT_TABLE_RACE_ORDER.some((key) => segMap.get(key)?.estimated === true);
  const estimatedSplitNote = hasEstimatedSplit
    ? `<p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;line-height:1.45;margin:8px 0 0;">Splits marked "&lt;" were missing from official results and estimated from your total race time. That estimate is also missing RoxZone transition time normally counted separately, so your real split time is likely lower than shown.</p>`
    : "";

  function renderTotals() {
    function totalsRow(key, labelOverride, bold) {
      const seg = segMap.get(key);
      if (!seg) return "";
      const gap = splitGapSeconds(seg, hasGoalGroup);
      const targetSecs = splitTargetSeconds(seg, hasGoalGroup);
      const userT = Number.isFinite(seg.userSeconds) ? formatTime(seg.userSeconds) : "&ndash;";
      const targetT = Number.isFinite(targetSecs) ? formatTime(targetSecs) : "&ndash;";
      const gapStr = splitGapDisplay(gap);
      const gapColor = splitGapColor(gap);
      const bg = key === "total_time" ? "background-color:#e2e8f0;" : "background-color:#ffffff;";
      const weight = bold ? "font-weight:700;" : "";
      return `<tr style="${bg}">
        <td style="padding:8px 8px 8px 16px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;${weight}color:#0f172a;">${splitSafe(labelOverride ?? seg.label)}</td>
        <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;${weight}color:#0f172a;">${splitSafe(userT)}</td>
        <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;${weight}color:#475569;">${splitSafe(targetT)}</td>
        <td style="padding:8px 16px 8px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:${gapColor};">${splitSafe(gapStr)}</td>
      </tr>`;
    }

    const totalsPenaltyRow = totalPenaltySeconds > 0 ? `<tr style="background-color:#fff4f4;">
      <td style="padding:8px 8px 8px 16px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">Penalties</td>
      <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;color:#e53e3e;">${splitSafe(formatTime(totalPenaltySeconds))}</td>
      <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;color:#475569;">0:00</td>
      <td style="padding:8px 16px 8px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:#e53e3e;">+${splitSafe(formatGain(totalPenaltySeconds))}</td>
    </tr>` : "";

    return `
    <tr>
	      <td style="background-color:#f1f5f9;padding:8px 24px;border-top:2px solid #e2e8f0;">
        <span style="color:#475569;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">TOTALS</span>
      </td>
    </tr>
    <tr>
      <td style="background-color:#ffffff;padding:0;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr style="background-color:#f8fafc;">
            <th style="padding:6px 8px 6px 16px;text-align:left;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Category</th>
            <th style="padding:6px 8px;text-align:right;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Your Time</th>
            <th style="padding:6px 8px;text-align:right;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#22d3ee;">Target *</th>
            <th style="padding:6px 16px 6px 8px;text-align:right;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Gap</th>
          </tr>
          ${totalsRow("run_time", "Total Running", true)}
          ${totalsRow("work_time", "Total Stations", true)}
          ${totalsPenaltyRow}
          ${totalsRow("roxzone_time", "Total RoxZone", true)}
          ${totalsRow("total_time", "Total Race Time", true)}
        </table>
      </td>
    </tr>`;
  }

  function renderHowToRead() {
    return `<tr>
	      <td style="background-color:#f8fafc;padding:12px 24px 16px;border-top:1px solid #e2e8f0;">
	        <span style="display:block;color:#94a3b8;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:6px;">HOW TO READ THIS</span>
	        <p style="color:#94a3b8;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;margin:0;">${hasGoalGroup ? "Red highlights the most actionable losses. Amber flags moderate gaps. Green means faster than target. Target status shows whether each segment is ahead of target, on target, or an opportunity against the selected target profile." : "Red highlights the most actionable losses. Amber flags moderate gaps. Green means faster than the comparison time. Split status uses the seconds gap for that segment, not a split percentile."}</p>
      </td>
    </tr>`;
  }

  const splitReportLink = splitReportUrl
    ? `<a href="${esc(splitReportUrl)}" target="_blank" style="display:block;background-color:#e8f7fd;border:1px solid #bdeafb;border-radius:8px;padding:14px 16px;margin-top:12px;color:#22d3ee;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;text-decoration:none;">View the full split report &#8594;</a>`
    : "";
  const splitGapHeader = !hasGoalGroup && gapComparisonBand && gapComparisonBand !== achievedBand
    ? `Gap vs ${bandDisplayLabel(gapComparisonBand)}`
    : hasGoalGroup
      ? "Gap vs target"
      : "Gap vs median";

	  return `
	    ${renderSplitHeader()}
	    ${renderRaceStorySummary()}
	    ${renderTargetRoadmap()}
	    ${renderGapBreakdown()}
	    ${renderSummaryCards()}
	    ${renderTargetPriorities()}
	    ${renderSegmentHighlights()}
    <tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
	        <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">FULL SPLIT DETAIL</span>
	        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-collapse:collapse;width:100%;">
          <tr style="background-color:#f1f5f9;border-bottom:2px solid #e2e8f0;">
            <th style="padding:7px 8px 7px 12px;text-align:left;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:32%;">Segment</th>
		            <th style="padding:7px 6px;text-align:left;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:16%;">${hasGoalGroup ? "Target basis" : "Comparison"}</th>
	            <th style="padding:7px 6px;text-align:left;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:14%;">${hasGoalGroup ? "Target status" : "Split status"}</th>
            <th style="padding:7px 8px;text-align:right;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:14%;">Your split</th>
            <th style="padding:7px 12px 7px 8px;text-align:right;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:24%;">${splitGapHeader}</th>
          </tr>
          ${penaltyRowHtml}
          ${splitTableRows}
	        </table>
        ${splitTableNote}
        ${estimatedSplitNote}
	        ${splitReportLink}
	      </td>
    </tr>`;
}

function renderFooter() {
  return `
  <tr>
    <td style="background-color:#07111f;padding:22px 32px;border-radius:0 0 8px 8px;
      border-top:1px solid rgba(148,163,184,0.12);">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="vertical-align:middle;padding-right:8px;">${logoMark(20)}</td>
          <td style="vertical-align:middle;">
            <p style="color:#64748b;font-family:Inter,Arial,sans-serif;font-size:11px;
              letter-spacing:0.04em;margin:0 0 3px;">
              www.getforma.fit
            </p>
            <p style="color:#4a5568;font-family:Inter,Arial,sans-serif;font-size:10px;margin:0;">
              This analysis is for guidance only. Individual results vary.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderDoublesCaveat(analysisJson = {}) {
  if (!analysisJson.benchmarkContext?.doublesBenchmarkedAsSingles) return "";
  return `<tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;">
      <div style="background-color:#fffbeb;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:8px;padding:14px 18px;">
        <span style="display:block;color:#92400e;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">DOUBLES RESULT</span>
        <p style="color:#78350f;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;">This is a HYROX Doubles result. We don&#39;t yet have a dedicated doubles benchmark dataset, so all percentiles and comparisons in this report are measured against the singles open-division population. Use these benchmarks as a directional guide rather than a precise competitive ranking.</p>
      </div>
    </td>
  </tr>`;
}

function renderDoublesConfirmation(_analysisJson = {}) {
  return "";
}

function renderMethodNote(hasMaterialPenalties = false, calculatorMode = "target", analysisJson = {}) {
  const penaltyNote = hasMaterialPenalties
    ? " Penalties are separated from running in the gap breakdown to avoid confusing execution leakage with run fitness."
    : "";
	  const doublesNote = analysisJson.benchmarkContext?.useDoublesBenchmarks
	    ? (() => {
	        const group = methodNoteComparisonGroup(analysisJson, calculatorMode);
	        const n = Number(group?.sampleSize);
        return n
          ? ` Doubles benchmarks use a dedicated doubles dataset — this comparison group includes ${n.toLocaleString()} teams, not singles data.`
          : " Doubles benchmarks use a dedicated doubles dataset — not singles data.";
      })()
    : "";
  const methodCopy = calculatorMode === "analyse"
    ? `Benchmarks are based on your selected benchmark band.${penaltyNote}${doublesNote} Segment gaps are each measured against the benchmark median for that segment, so they may not sum exactly to the total race gap. Gaps are estimates, not guarantees. A positive gap means slower than the benchmark median; a negative gap means faster.`
    : `Target times are based on your selected target profile.${penaltyNote}${doublesNote} Segment gaps are measured against the target profile for that segment, so they may not sum exactly to the total race gap. Gaps are estimates, not guarantees. A positive gap means slower than target; a negative gap means faster.`;
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;">
      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:0 0;">
        <span style="display:block;color:#94a3b8;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">METHOD NOTE</span>
        <p style="color:#64748b;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;">${esc(methodCopy)}</p>
      </div>
    </td>
  </tr>`;
}

function parseStationSignals(items) {
  const rows = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const weakMatch = String(item).match(/^Weak(?:est)? stations?:\s*(.+)$/i);
    const strongMatch = String(item).match(/^(?:Strongest stations?|Relative strengths?(?: stations?)?):\s*(.+)$/i);
    if (weakMatch) {
      weakMatch[1].split(/,\s*/).forEach((entry) => {
        const name = entry.replace(/\s*\([^)]*\)/, "").trim();
        if (name) rows.push({ name, signal: "Weakness", color: "#e53e3e", bg: "#fff4f4" });
      });
    } else if (strongMatch) {
      strongMatch[1].split(/,\s*/).forEach((entry) => {
        const name = entry.replace(/\s*\([^)]*\)/, "").trim();
        if (name) rows.push({ name, signal: "Strength", color: "#16a34a", bg: "#f0fdf4" });
      });
    }
  }
  return rows;
}

function isEliteOrSub60Context(analysisJson = {}) {
  const achievedBand = analysisJson.benchmarkContext?.achievedBand ?? analysisJson.achievedBand ?? null;
  if (achievedBand === "sub_60") return true;
  const finishTimeSeconds = analysisJson.race?.finishTimeSeconds ?? analysisJson.finishTimeSeconds ?? null;
  if (Number.isFinite(finishTimeSeconds) && finishTimeSeconds <= 3600) return true;
  const benchmarkLabel = analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "";
  return /\bsub[-_\s]?60\b/i.test(String(benchmarkLabel));
}

function getMuscleSignalLabel(rawSignal, isElite, weakCount) {
  if (rawSignal !== "Weakness") {
    return { label: "Strength", severity: "strength", color: "#4ade80", bg: "#052e16", border: "1px solid #166534" };
  }
  if (isElite) {
    return { label: "Refinement Area", severity: "refinement", color: "#22d3ee", bg: "#0c4a6e", border: "1px solid #0e7490" };
  }
  const count = typeof weakCount === "number" ? weakCount : 0;
  if (count >= 3) {
    return { label: "Weakness", severity: "weakness", color: "#f87171", bg: "#450a0a", border: "1px solid #7f1d1d" };
  }
  return { label: "Opportunity", severity: "opportunity", color: "#fbbf24", bg: "#2a1f0b", border: "1px solid rgba(245,158,11,0.45)" };
}

function muscleSignalWeakCountByLabel(analysisJson = {}) {
  const muscleGroupSignalsList = analysisJson.muscleGroupProfile?.muscleGroupSignals ?? [];
  return new Map(
    muscleGroupSignalsList
      .filter((signal) => signal && signal.label)
      .map((signal) => [String(signal.label).toLowerCase(), signal.weakCount ?? 0]),
  );
}

function mapMuscleSignal(row, isElite, weakCountByLabel) {
  const weakCount = weakCountByLabel.get(String(row.area ?? "").toLowerCase()) ?? null;
  const { label, color, bg, border } = getMuscleSignalLabel(row.signal, isElite, weakCount);
  return { ...row, signal: label, color, bg, border };
}

function parseMuscleAreaSignals(items) {
  const text = items.join("\n");
  const rows = [];
  const summary = items.find((item) => /common thread across your weakest stations/i.test(item)) ?? "";
  const strengthSummary = items.find((item) => /clear strength/i.test(item)) ?? summary;
  const weakAreasMatch = summary.match(/^(.+?)\s+are the common thread across your weakest stations/i);
  const strongAreaMatch = strengthSummary.match(/weakest stations;\s*your\s+(.+?)\s+is a clear strength/i)
    ?? strengthSummary.match(/^your\s+(.+?)\s+is a clear strength/i);
  const weakStations = (text.match(/Weakest stations:\s*(.+)/i)?.[1] ?? "")
    .split(/,\s*/)
    .map((entry) => entry.replace(/\s*\([^)]*\)/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const strongStations = (text.match(/Strongest stations?:\s*(.+)/i)?.[1] ?? "")
    .split(/,\s*/)
    .map((entry) => entry.replace(/\s*\([^)]*\)/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (weakAreasMatch) {
    weakAreasMatch[1].split(/\s+and\s+/i).forEach((area) => {
      const name = area.trim();
      if (name) {
        rows.push({
          area: name,
          signal: "Weakness",
          meaning: weakStations.length ? `${weakStations.join(", ")} are low-ranked` : "Low-ranked stations share this demand",
        });
      }
    });
  }
  if (strongAreaMatch) {
    const area = strongAreaMatch[1].trim();
    if (area) {
      rows.push({
        area,
        signal: "Strength",
        meaning: strongStations.length ? `${strongStations.join(", ")} are stronger` : "Higher-ranked stations share this demand",
      });
    }
  }
  return rows;
}

function renderMuscleGroupSection(section, analysisJson = {}) {
  const content = Array.isArray(section.content) ? section.content : [section.content];
  const textItems = content.filter((item) => typeof item === "string");
  const isElite = isEliteOrSub60Context(analysisJson);
  const weakCountByLabel = muscleSignalWeakCountByLabel(analysisJson);
  const muscleGroupSignals = analysisJson.muscleGroupProfile?.muscleGroupSignals ?? [];
  const areaRowsFromSignals = muscleGroupSignals
    .filter((g) => g.signal === "limiter" || g.signal === "asset")
    .sort((a, b) => {
      if (a.signal === "limiter" && b.signal !== "limiter") return -1;
      if (b.signal === "limiter" && a.signal !== "limiter") return 1;
      return (b.weakCount ?? 0) - (a.weakCount ?? 0);
    })
    .map((g) => ({
      area: g.label,
      signal: g.signal === "limiter" ? "Weakness" : "Strength",
    }));
  const areaRowsFallback = (() => {
    const parsed = parseMuscleAreaSignals(textItems);
    if (parsed.length > 0) return parsed;
    return parseStationSignals(textItems).map((row) => ({
      area: row.name,
      signal: row.signal,
    }));
  })();
  const rows = (areaRowsFromSignals.length > 0 ? areaRowsFromSignals : areaRowsFallback)
    .map((row) => mapMuscleSignal(row, isElite, weakCountByLabel));
  const signalTableHtml = rows.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:12px;border:1px solid #e2e8f0;">
      <tr style="background-color:#f8fafc;">
	        <th width="50%" style="padding:8px;text-align:left;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Area</th>
	        <th width="50%" style="padding:8px;text-align:center;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Signal</th>
      </tr>
      ${rows.map((row) => `<tr>
        <td style="padding:10px 8px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;border-top:1px solid #e2e8f0;"><strong>${esc(row.area)}</strong></td>
	        <td style="padding:10px 8px;border-top:1px solid #e2e8f0;text-align:center;"><span style="display:inline-block;background-color:${row.bg};color:${row.color};border:${row.border};font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;text-transform:uppercase;font-weight:700;letter-spacing:0.06em;padding:3px 6px;border-radius:4px;">${esc(row.signal)}</span></td>
      </tr>`).join("")}
    </table>`
    : "";
  // Always use the data-driven trainingHint (keyed off the athlete's actual primary muscle
  // limiter, via TRAINING_HINTS in muscleGroupMap.js) rather than a fixed penalty-branch
  // sentence - a hardcoded "posterior-chain... sled-specific pulling" recommendation is wrong
  // whenever the athlete's real limiter is a different muscle group (e.g. grip/forearm).
  const implication = textItems.find((item) => /^Training focus:/i.test(item))
    ?? "Training implication: a targeted strength-endurance block is the highest-leverage cross-station investment.";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#22d3ee;font-family:'Inter Tight','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">MUSCLE GROUP SIGNAL</span>
      ${signalTableHtml}
      <p style="color:#475569;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:12px 0 0;">${esc(enforceTone(implication))}</p>
    </td>
  </tr>`;
}

function renderSection(section, analysisJson, interpretation = null, calculatorMode = "target") {
  const SUPPRESSED_IN_EMAIL = new Set([
    "executive_summary",
    "race_snapshot",
    "biggest_strength",
    "time_potential",
    "running_fatigue",
  ]);
  if (SUPPRESSED_IN_EMAIL.has(section.sectionKey)) return "";

  switch (section.sectionKey) {
    case "executive_summary":
      return renderExecutiveSummary(section);
    case "biggest_strength":
      return renderStrengthCard(section);
    case "biggest_limiter": {
      const { penaltiesAreMaterial } = penaltyContext(analysisJson);
      return penaltiesAreMaterial ? renderStationBreakdown(section) : "";
    }
    case "time_potential":
      return renderTimePotential(section);
    case "athlete_background":
      return renderAthleteBackground(section);
    case "recommended_focus_areas":
      return renderRecommendations(section, analysisJson);
    case "cta":
      return renderCta(section, analysisJson, buildCtaCopy(calculatorMode, interpretation?.primaryThesis?.category), calculatorMode);
    case "race_snapshot":
      return "";
    case "penalty_callout":
      return renderPenaltyCallout(section, interpretation, analysisJson);
    case "race_split_breakdown":
      return renderSplitTable(section, analysisJson);
    case "muscle_group_profile":
      return renderMuscleGroupSection(section, analysisJson);
    case "roxzone_execution":
      return renderRoxzoneExecution(section, interpretation);
    default:
      return renderTextCard(section, interpretation, analysisJson);
  }
}

export function buildEmailReport(personalReport = { sections: [] }, analysisJson = {}, athleteContext = {}, interpretation = null, calculatorMode = "target") {
  const {
    penalties: emailPenalties,
    totalPenaltySeconds: emailPenaltySeconds,
    penaltiesAreMaterial: emailPenaltiesMaterial,
    usePenaltyHero,
  } = penaltyContext(analysisJson);
  const legacyLimiter = limiterName(analysisJson);

  // Compute the email's top-ranked opportunity using the same gap basis as renderSegmentHighlights,
  // so subject line and Main Insight agree with the Biggest Opportunities table.
  const emailHasGoalGroup = Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup);
  const emailSegMap = new Map((analysisJson.segments ?? []).map((s) => [s.segmentKey, s]));
  function emailGapSeconds(seg) {
    if (!seg) return null;
    if (emailHasGoalGroup) {
      return seg.frameGapSeconds ?? seg.timeGapToExactTargetSeconds ?? seg.timeGapToMedianSeconds ?? null;
    }
    return seg.frameGapSeconds ?? seg.timeGapToMedianSeconds ?? null;
  }
  function emailPenaltySecondsForSegmentKey(segmentKey) {
    return emailPenalties.reduce((sum, penalty) => {
      const keys = [penalty.segmentKey, penalty.runKey, penalty.station]
        .filter(Boolean)
        .map((value) => String(value));
      return keys.includes(segmentKey) ? sum + (Number(penalty.penaltySeconds) || 0) : sum;
    }, 0);
  }
  function emailOpportunityGapSeconds(seg) {
    const rawGap = emailGapSeconds(seg);
    if (!emailPenaltiesMaterial || !seg?.segmentKey || !Number.isFinite(rawGap)) return rawGap;
    const segmentPenaltySeconds = emailPenaltySecondsForSegmentKey(seg.segmentKey);
    return segmentPenaltySeconds > 0 ? rawGap - segmentPenaltySeconds : rawGap;
  }
  // RoxZone is included alongside station/run splits so the hero/headline limiter can name a
  // genuinely dominant transition loss, matching findBiggestLimiter's behavior elsewhere.
  const emailOpportunitySegments = [...SPLIT_TABLE_RACE_ORDER, "roxzone_time"]
    .map((key) => {
      const rawSeg = emailSegMap.get(key);
      const seg = key === "roxzone_time" && rawSeg ? { ...rawSeg, label: "RoxZone" } : rawSeg;
      const gap = emailOpportunityGapSeconds(seg);
      if (!seg?.label || !Number.isFinite(gap)) return null;
      return {
        ...seg,
        frameGapSeconds: gap,
        timeGapToExactTargetSeconds: undefined,
        timeGapToMedianSeconds: gap,
        confidence: seg.confidence ?? "high",
      };
    })
    .filter(Boolean);
  const emailTopLimiter = findBiggestLimiter(emailOpportunitySegments);
  const emailTopSeg = emailTopLimiter?.segmentKey ? emailSegMap.get(emailTopLimiter.segmentKey) : null;
  const emailTopLabel = emailTopLimiter?.label ?? legacyLimiter;
  const emailTopSegType = emailTopLimiter?.type ?? emailTopSeg?.type ?? null;
  const heroOverrideCopy = interpretation?.primaryThesis
    ? buildHeroCopy(interpretation.primaryThesis, analysisJson, calculatorMode, emailTopLabel, emailTopSegType)
    : null;

  const subject = (() => {
    if (usePenaltyHero) return `Your HYROX fastest win is ${formatGain(emailPenaltySeconds)} of penalties`;
    if (calculatorMode === "analyse") {
	      const analysisFrame = analysisJson.benchmarkContext?.analysisFrame;
	      const frame = analysisFrame?.frame;
	      const achievedBand = analysisJson.benchmarkContext?.achievedBand;
	      const useOver105Band = Boolean(analysisJson.benchmarkContext?.useDoublesBenchmarks);
	      const bandLabel = bandDisplayLabel(achievedBand, { useOver105Band });
	      const compBand = analysisFrame?.comparisonBand ?? analysisJson.benchmarkContext?.nextBand ?? null;
	      const stretchBand = analysisFrame?.stretchBand ?? null;
	      const compBandLabel = bandDisplayLabel(compBand, { useOver105Band });
	      const stretchBandLabel = bandDisplayLabel(stretchBand, { useOver105Band });
	      const explicitNextBandLabel = bandDisplayLabel(analysisJson.benchmarkContext?.nextBand, { useOver105Band });

      if (frame === "next_band" || frame === "next_band_stretch") {
        if (bandLabel && compBandLabel && bandLabel !== compBandLabel) {
          return `You're ahead of your ${bandLabel} group. ${compBandLabel} is the next test.`;
        }
        if (compBandLabel && compBandLabel !== bandLabel) {
          return `You have the engine. ${compBandLabel} is the next test.`;
        }
      }

      if (frame === "competitive" && bandLabel && stretchBandLabel) {
        return `You're competitive in ${bandLabel}. Here's what moves you to ${stretchBandLabel}.`;
      }

      if (achievedBand === "sub_60") {
        const totalSegSub60 = (analysisJson.segments ?? []).find((s) => s.segmentKey === "total_time");
        const sub60Gap = analysisFrame?.gapToBandMedianSeconds;
        if (Number.isFinite(sub60Gap) && sub60Gap < 0) {
          const sub60Percentile = Number(totalSegSub60?.percentile);
          const topPct = Number.isFinite(sub60Percentile) ? Math.max(1, Math.round(100 - sub60Percentile)) : null;
          return topPct
            ? `You're in the top ${topPct}% of sub-60 finishers. Here's the next refinement.`
            : "You're ahead of the sub-60 median. Here's the next refinement.";
        }
        return "You're sub-60. Here's what separates you from the top of the group.";
      }
	      if (bandLabel && compBandLabel && bandLabel !== compBandLabel) {
	        return `You're in the ${bandLabel} band. Here's the route to ${compBandLabel}.`;
	      }
	      if (bandLabel && explicitNextBandLabel && bandLabel !== explicitNextBandLabel) {
	        return `You're in the ${bandLabel} band. Here's the route to ${explicitNextBandLabel}.`;
	      }
	      if (bandLabel) {
	        return `You're in the ${bandLabel} band. Here's where the next time comes from.`;
	      }
	      const totalSeg = (analysisJson.segments ?? []).find((s) => s.segmentKey === "total_time");
		      const pct = formatPercentileRank(totalSeg?.percentile);
		      return pct ? `Your HYROX analysis - you finished in the ${pct}` : "Your HYROX race analysis is ready";
		    }
		    const goalTargetSecs = selectedTargetSecondsForEmail(analysisJson, athleteContext);
		    const goalTargetFmt = goalTargetSecs ? formatTime(goalTargetSecs) : null;
	    if (goalTargetFmt) {
	      return `Your route to ${goalTargetFmt}: ${emailTopLabel ? `start with ${emailTopLabel}` : "the target roadmap"}`;
	    }
	    return "Your HYROX target time analysis";
	  })();
  const greetingName = resolveGreetingName(athleteContext.firstName ?? athleteContext.displayName ?? null);
  const greeting = `Hi ${greetingName},`;
  const sections = Array.isArray(personalReport.sections) ? personalReport.sections : [];
  const textSections = sections
    .map((section) => `${section.title}\n${contentText(section.content)}`)
    .join("\n\n");
  const textBody = enforceTone(`${greeting}\n\n${textSections}`);
  const sectionRows = sections.map((section) => renderSection(section, analysisJson, interpretation, calculatorMode)).join("");
  const outerTableStyle = inlineStyle({
    width: "100%",
    "border-collapse": "collapse",
    "background-color": "#f0f4f8",
  });
  const innerTableStyle = inlineStyle({
    "max-width": "600px",
    width: "100%",
    "background-color": "#ffffff",
    "border-radius": "8px",
    overflow: "hidden",
  });
  const rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Inter+Tight:wght@700;800&display=swap');
  </style>
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Inter,Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="${outerTableStyle}">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${innerTableStyle}">
          ${renderHeader()}
          ${renderHero(analysisJson, greetingName, heroOverrideCopy ? { ...interpretation, heroCopy: heroOverrideCopy } : interpretation)}
          ${renderMetricStrip(analysisJson, athleteContext, calculatorMode)}
          ${calculatorMode === "target"
            ? renderTargetLensCard(analysisJson, athleteContext)
            : renderBenchmarkLensCard(analysisJson, athleteContext)}
          ${renderDoublesCaveat(analysisJson)}
          ${renderDoublesConfirmation(analysisJson)}
          ${sectionRows}
          ${renderTargetModeNudge(athleteContext, calculatorMode)}
          ${renderMethodNote(emailPenaltiesMaterial, calculatorMode, analysisJson)}
          ${renderFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: enforceTone(subject),
    htmlBody: enforceTone(applyUnifiedDarkTheme(rawHtml)),
    textBody,
  };
}
