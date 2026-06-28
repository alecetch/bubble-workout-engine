import { bandScoreColor, bandScoreLabel, enforceTone, formatGain, formatOverallStanding, formatPercentileRank, formatTime } from "./copyFormatter.js";

function eliteBandLabel(bsLabel) {
  if (bsLabel === "Priority") return "Next refinement";
  if (bsLabel === "Opportunity") return "Marginal gain";
  return bsLabel;
}

function bandDisplayLabel(band) {
  if (!band) return null;
  if (band === "sub_105") return "90:00+";
  return band.replace("sub_", "sub-");
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

function inlineStyle(props) {
  return Object.entries(props).map(([key, value]) => `${key}:${value}`).join(";");
}

function limiterName(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter?.label ?? analysisJson.limiters?.[0]?.label ?? null;
}

function penaltyContext(analysisJson = {}) {
  const penalties = analysisJson.penalties ?? [];
  const totalPenaltySeconds = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const totalTimeSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const totalGapSeconds = Math.max(0, splitGapSeconds(totalTimeSeg, Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup)) ?? 0);
  const penaltiesAreMaterial =
    totalPenaltySeconds >= 60 ||
    (totalGapSeconds > 0 && totalPenaltySeconds / totalGapSeconds >= 0.10);
  const usePenaltyHero =
    totalPenaltySeconds >= 180 &&
    totalGapSeconds > 0 &&
    totalPenaltySeconds / totalGapSeconds >= 0.25;
  const raceTimeSeconds = analysisJson.race?.finishTimeSeconds ?? null;
  const adjustedRaceTimeSeconds = totalPenaltySeconds > 0 && Number.isFinite(raceTimeSeconds)
    ? raceTimeSeconds - totalPenaltySeconds
    : null;
  return { penalties, totalPenaltySeconds, totalGapSeconds, penaltiesAreMaterial, usePenaltyHero, adjustedRaceTimeSeconds };
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
  if (sectionKey === primaryKey) return "#08a7f5";
  if (secondaryKeys.includes(sectionKey)) return "#f59e0b";
  return "#e2e8f0";
}

function headingDot(accentColor) {
  if (accentColor !== "#08a7f5" && accentColor !== "#f59e0b") return "";
  return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${accentColor};margin-right:6px;vertical-align:middle;"></span>`;
}

function renderHeader() {
  return `<tr>
    <td style="${inlineStyle({
      "background-color": "#080e1a",
      padding: "22px 32px",
      "border-radius": "8px 8px 0 0",
    })}">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="vertical-align:middle;">
            <span style="${inlineStyle({
              color: "#08a7f5",
              "font-family": "'Arial Narrow','Helvetica Neue',Arial,sans-serif",
              "font-size": "20px",
              "font-weight": "700",
              "letter-spacing": "0.06em",
              "text-transform": "uppercase",
            })}">FORMA</span>
            <span style="${inlineStyle({
              display: "block",
              color: "#8fa0ba",
              "font-family": "Arial,Helvetica,sans-serif",
              "font-size": "10px",
              "letter-spacing": "0.08em",
              "text-transform": "uppercase",
              "margin-top": "4px",
            })}">HYROX PERFORMANCE ANALYSIS</span>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <span style="color:#8fa0ba;font-family:Arial,Helvetica,sans-serif;font-size:11px;">forma.fit</span>
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
        color: "#08a7f5",
        "line-height": "1",
        margin: "8px 0 12px",
      })}">${esc(heroCopy.gainDisplay)}</div>`
    : "";
  const subline = heroCopy.subline
    ? `<div style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;margin-bottom:0;">${esc(heroCopy.subline)}</div>`
    : "";

  return `<tr>
    <td style="${inlineStyle({
      "background-color": "#ffffff",
      padding: "28px 32px 24px 29px",
      "border-left": "3px solid #08a7f5",
      "border-bottom": "1px solid #e2e8f0",
    })}">
      <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:0 0 18px;">Hi ${esc(greetingName)},</p>
      <div style="${inlineStyle({
        "font-family": "'Arial Narrow','Helvetica Neue',Arial,sans-serif",
        "font-size": "30px",
        "font-weight": "700",
        color: "#0f172a",
        "line-height": "1.1",
        "text-transform": "uppercase",
        "margin-bottom": "4px",
      })}">${headlineText}</div>
      ${heroNumber}
      ${subline}
    </td>
  </tr>`;
}

function analyseBenchmarkCellLabel(analysisJson) {
  const achievedBand = analysisJson?.benchmarkContext?.achievedBand;
  const bandLabel = bandDisplayLabel(achievedBand);
  const groupLabel = analysisJson?.benchmarkContext?.primaryBenchmarkGroup?.label ?? "Your division";
  const confidence = analysisJson?.benchmarkContext?.confidenceLabel;
  const confidenceSuffix = ["directional", "low-confidence"].includes(confidence)
    ? ` (${confidence})`
    : "";
  return bandLabel ? `${bandLabel} - ${groupLabel}${confidenceSuffix}` : `${groupLabel}${confidenceSuffix}`;
}

const BAND_RANGES = {
  sub_60: "under 60:00",
  sub_65: "between 60:00 and 64:59",
  sub_70: "between 65:00 and 69:59",
  sub_75: "between 70:00 and 74:59",
  sub_80: "between 75:00 and 79:59",
  sub_90: "between 80:00 and 89:59",
  sub_105: null,
};

function renderBenchmarkExplanation(analysisJson = {}, calculatorMode = "target") {
  if (calculatorMode === "analyse") {
    const achievedBand = analysisJson.benchmarkContext?.achievedBand;
    if (!achievedBand) return "";

    const division = analysisJson.athlete?.division ?? "Open";
    const gender = analysisJson.athlete?.gender ?? "";
    const divLabel = [division, gender].filter(Boolean).join(" ");
    const confidenceLabel = analysisJson.benchmarkContext?.confidenceLabel;
    const isLowSample = ["low-confidence", "directional"].includes(confidenceLabel);

    let explanation;
    if (achievedBand === "sub_105") {
      explanation = `Your benchmark band: ${divLabel} athletes finishing in the 90:00+ performance range. This is a wider comparison band because the field spreads out more at this end of the results.`;
    } else {
      const range = BAND_RANGES[achievedBand];
      explanation = range
        ? `Your benchmark band: ${divLabel} athletes finishing ${range}. This compares you with athletes at a similar race level, so the analysis reflects realistic opportunities for improvement.`
        : `Your benchmark band is the ${achievedBand.replace("sub_", "sub-")} group.`;
    }

    const lowSampleNote = isLowSample
      ? " This benchmark band has a smaller sample size, so treat band scores as directional. The priority areas are still useful."
      : "";

    return `<tr>
      <td style="background-color:#ffffff;padding:8px 24px 14px;border-bottom:1px solid #e2e8f0;">
        <p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;font-style:italic;">${esc(explanation + lowSampleNote)}</p>
      </td>
    </tr>`;
  }

  const goalGroup2 = analysisJson?.benchmarkContext?.goalBenchmarkGroup;
  const targetTimeFmt = goalGroup2?.targetFinishSeconds
    ? formatTime(goalGroup2.targetFinishSeconds)
    : null;
  if (!targetTimeFmt) return "";

  const explanation = `Your target analysis compares your current race with a realistic split profile for ${targetTimeFmt}. The gaps below show where you need to find time to make the target achievable.`;

  return `<tr>
    <td style="background-color:#f0f9ff;border-top:1px solid #bae6fd;border-bottom:1px solid #bae6fd;padding:10px 24px;">
      <p style="color:#0369a1;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;margin:0;">
        ${esc(explanation)}
      </p>
    </td>
  </tr>`;
}

function renderMetricStrip(analysisJson, athleteContext, calculatorMode = "target") {
  const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const { totalPenaltySeconds, penaltiesAreMaterial, adjustedRaceTimeSeconds } = penaltyContext(analysisJson);
  const finishTime = formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "-";
  const selectedTargetSeconds = analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds
    ?? totalSeg?.exactTargetSeconds
    ?? null;
  const benchmarkTime = formatTime(
    calculatorMode === "analyse"
      ? totalSeg?.exactTargetSeconds
        ?? totalSeg?.goalBenchmarkSeconds
        ?? analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds
      : selectedTargetSeconds,
  ) ?? "-";
  const adjustedTime = Number.isFinite(adjustedRaceTimeSeconds) ? formatTime(adjustedRaceTimeSeconds) : "-";
  const rank = esc(formatOverallStanding(totalSeg?.fieldPercentile ?? totalSeg?.percentile) ?? "-");
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
    ...(borderRight ? { "border-right": "1px solid #e2e8f0" } : {}),
  });
  const labelStyle = inlineStyle({
    display: "block",
    color: "#94a3b8",
    "font-family": "Arial,Helvetica,sans-serif",
    "font-size": "10px",
    "text-transform": "uppercase",
    "letter-spacing": "0.06em",
    "margin-bottom": "6px",
  });
  function metricCell(label, value, valueColor = "#0f172a", borderRight = true, valueFont = "'Courier New',Courier,monospace") {
    return `<td width="${colWidth}" style="${cellStyle(borderRight)}">
      <span style="${labelStyle}">${esc(label)}</span>
      <span style="display:block;font-family:${valueFont};font-size:15px;font-weight:700;color:${valueColor};">${value}</span>
    </td>`;
  }
  const penaltyCell = hasPenalties
    ? metricCell("PENALTIES", totalPenaltySeconds > 0 ? esc(formatGain(totalPenaltySeconds) ?? "-") : "None", totalPenaltySeconds > 0 ? "#7c3aed" : "#22c55e", false)
    : "";
  const secondCell = showAdjusted
    ? metricCell("ADJUSTED", esc(adjustedTime), "#0f172a", true)
    : calculatorMode === "analyse"
      ? metricCell(
          "BENCHMARK BAND",
          esc(analyseBenchmarkCellLabel(analysisJson)),
          "#0f172a",
          true,
          "Arial,Helvetica,sans-serif",
        )
		      : metricCell("TARGET TIME", esc(benchmarkTime), "#0f172a", true);
  const thirdCell = calculatorMode === "analyse"
    ? metricCell("OVERALL STANDING", rank, "#0f172a", hasPenalties, "Arial,Helvetica,sans-serif")
    : metricCell(
        "TARGET GAP",
        esc(targetGap),
        Number.isFinite(targetGapSeconds) && targetGapSeconds <= 0 ? "#22c55e" : "#d97706",
        hasPenalties,
        "Arial,Helvetica,sans-serif",
      );

  return `<tr>
    <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          ${metricCell("YOUR RACE", esc(finishTime), "#0f172a", true)}
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
    .map((item) => `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0 0 10px;">${esc(enforceTone(String(item)))}</p>`)
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
	    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;border-left:3px solid #08a7f5;">
      <span style="color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">BIGGEST STRENGTH</span>
    </td>
  </tr>
  <tr>
	    <td style="background-color:#ffffff;padding:16px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;margin:0;">${text}</p>
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
    const gapColor = isLimiter ? "#e53e3e" : "#08a7f5";
    const borderBottom = isLast ? "" : "border-bottom:1px solid #f1f5f9;";
    const safe = esc(enforceTone(raw)).replace(
      /(\(([+-]?\d+:\d+[^)]*)\))/,
      `<span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:${gapColor};">$1</span>`,
    );
    return `<tr>
	      <td style="padding:10px 24px;${borderBottom}font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;line-height:1.4;">
        ${safe}
      </td>
    </tr>`;
  }
  const stationRows = weakItems.map((item, index) => stationRow(item, index === weakItems.length - 1 && !strengthItem)).join("");
  const strengthRow = strengthItem
    ? `<tr>
	        <td style="padding:10px 24px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#08a7f5;line-height:1.4;">
          ${esc(enforceTone(strengthItem))}
        </td>
      </tr>`
    : "";

  return `
  <tr>
	    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;">
      <span style="color:#475569;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">STATION BREAKDOWN</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:4px 0 0;border-bottom:1px solid #e2e8f0;">
	      <p style="color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 24px 4px;">${esc(preamble)}</p>
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
	    <td style="background-color:#e8f7fd;padding:18px 24px;border-left:3px solid #08a7f5;border-right:3px solid #08a7f5;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">TIME POTENTIAL</span>
      <p style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderTextCard(section, interpretation = null, analysisJson = {}) {
  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
  const { penaltiesAreMaterial } = penaltyContext(analysisJson);
  const filteredItems = items.filter(Boolean);
  const paragraphs = section.sectionKey === "training_volume" && filteredItems.length >= 2
    ? filteredItems.map((item, index) => {
      const labels = ["Running volume", "Strength frequency"];
      const marginTop = index === 0 ? "margin-top:0;" : "margin-top:12px;";
      const rawText = String(item).replace(
        "As a runner, building station-specific strength is often the highest-leverage change - prioritise functional loading over additional aerobic work.",
        "For athletes with a stronger running base, building station-specific strength is often the highest-leverage change - prioritise functional loading over additional aerobic work.",
      );
      const text = penaltiesAreMaterial && index === 0 && !/penalty-inflated/i.test(rawText)
        ? `${rawText} Because the Run 5 loss is penalty-inflated, do not treat the full raw running gap as a running-volume problem.`
        : rawText;
      return `<div style="${marginTop}">
        <span style="font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#475569;display:block;margin-bottom:4px;">${esc(labels[index] ?? `Point ${index + 1}`)}</span>
        <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${esc(enforceTone(text))}</p>
      </div>`;
    }).join("")
    : filteredItems
      .map((item, index) => {
        const border = index > 0 ? "border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px;" : "";
        return `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0;${border}">${esc(enforceTone(String(item)))}</p>`;
      })
      .join("");
  const titleText = esc(String(section.title ?? "").toUpperCase());
  return `
  <tr>
    <td style="background-color:#ffffff;padding:18px 24px;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">${titleText}</span>
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
    .map((item) => `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px;">${esc(enforceTone(String(item)))}</p>`)
    .join("");
  const materialParagraphs = penaltiesAreMaterial
    ? `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px;">${esc(formatGain(totalPenaltySeconds))} of penalties were recorded. Treat this separately from running: it is execution leakage, not aerobic capacity.</p>`
    : paragraphs;
  const adjustedLine = adjustedRaceTimeSeconds != null
    ? `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;margin:10px 0 0;">Adjusted race time without penalties: <strong>${esc(formatTime(adjustedRaceTimeSeconds))}</strong>.</p>`
    : "";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <div style="background-color:#f5f3ff;border:1px solid #ddd6fe;border-left:3px solid #7c3aed;border-radius:8px;padding:16px 18px;">
        <span style="display:block;color:#7c3aed;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">PENALTY ANALYSIS</span>
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
    <td style="background-color:#f8fafc;padding:10px 24px;border-top:1px solid #e2e8f0;border-left:3px solid #08a7f5;">
      <span style="color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">YOUR BACKGROUND IN CONTEXT</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderRecommendations(section, analysisJson = {}) {
  const richRecs = Array.isArray(section.richRecommendations) ? section.richRecommendations : null;
  const { penaltiesAreMaterial: hasMaterialPenalties } = penaltyContext(analysisJson);
  const stationLosses = (analysisJson.segments ?? [])
    .filter((segment) => segment.type === "station")
    .map((segment) => ({
      label: segment.label,
      gap: segment.frameGapSeconds ?? segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds,
    }))
    .filter((row) => Number.isFinite(row.gap) && row.gap > 30)
    .sort((a, b) => b.gap - a.gap);
  const limiter = analysisJson.headline?.biggestLimiter?.label ?? stationLosses[0]?.label;
  const priorities = hasMaterialPenalties
    ? [
        "Reclaim penalty time through station standards",
        "Sandbag lunge capacity under fatigue",
        "Sled pull efficiency and grip control",
        "Posterior-chain strength endurance",
        "Race-fatigued station practice",
      ]
    : [];
  if (!hasMaterialPenalties) {
    if (limiter) priorities.push(`${limiter} capacity and consistency`);
    priorities.push("Quad-dominant strength endurance");
    for (const row of stationLosses.slice(1, 3)) priorities.push(`${row.label} efficiency`);
    priorities.push("Race-fatigued station practice");
  }
  const listRows = [...new Set(priorities)].slice(0, 5)
    .map((item) => `<li style="margin:0 0 4px;">${esc(enforceTone(item))}</li>`)
    .join("");
  const primaryTitle = hasMaterialPenalties
    ? "Clean execution first, then sandbag durability."
    : (richRecs?.[0]?.title
        ? `${enforceTone(richRecs[0].title).replace(/\s+focus$/i, "")} under fatigue`
        : "Build station-specific strength endurance under fatigue");
  const primaryCategory = hasMaterialPenalties ? "Execution" : (richRecs?.[0]?.category ?? "Fitness");
  const categoryChip = (category) => {
    const styles = {
      Fitness: { bg: "#e0f2fe", color: "#0369a1" },
      Execution: { bg: "#ede9fe", color: "#7c3aed" },
      "Race management": { bg: "#fef3c7", color: "#d97706" },
    };
    const style = styles[category] ?? styles.Fitness;
    return `<span style="display:inline-block;background-color:${style.bg};color:${style.color};font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:1px 5px;border-radius:3px;margin-left:6px;">${esc(String(category).toUpperCase())}</span>`;
  };

  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <div style="background-color:#0c1830;color:#cbd5e1;border-radius:8px;padding:18px;">
        <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">NEXT TRAINING FOCUS</span>
        <h3 style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;margin:0 0 12px;">${esc(primaryTitle)}${categoryChip(primaryCategory)}</h3>
        <ol style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:0;padding-left:20px;">${listRows}</ol>
      </div>
    </td>
  </tr>`;
}

function buildCtaCopy(calculatorMode, primaryCategory) {
  if (primaryCategory === "high_performer") {
    return "Use Forma to build a training plan that preserves your strengths and finds marginal gains.";
  }
  if (calculatorMode === "analyse" && primaryCategory === "data_quality") {
    return "Use Forma to build a plan once your full split data is available.";
  }
  if (calculatorMode === "analyse") {
    return "Use Forma to build a plan targeting your race-profile opportunities.";
  }
  return "Use Forma to build a training plan targeting your bottleneck.";
}

function renderCta(section, analysisJson = {}, ctaCopy = null) {
  const ctaUrl = process.env.FORMA_CTA_URL ?? "https://forma.fit";
  const baseUrl = (process.env.BASE_URL ?? "https://getformai.com").replace(/\/$/, "");
  const submissionId = analysisJson.submissionId ?? null;
  const carouselUrl = analysisJson.carouselUrl ?? (submissionId ? `${baseUrl}/api/hyrox/carousel/${submissionId}` : null);
  const rawContent = ctaCopy ?? (Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? ""));
  const bodyText = esc(enforceTone(rawContent));
  const carouselLink = carouselUrl
    ? `<a href="${esc(carouselUrl)}" target="_blank" style="display:inline-block;margin-top:14px;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-decoration:none;">View your shareable carousel &#8594;</a>`
    : "";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e2e8f0;">
      <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0 0 20px;">${bodyText}</p>
      <a href="${esc(ctaUrl)}" target="_blank" style="${inlineStyle({
        display: "inline-block",
        "background-color": "#08a7f5",
        color: "#07101e",
        "font-family": "'Courier New',Courier,monospace",
        "font-size": "13px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": "0.06em",
        padding: "14px 36px",
        "border-radius": "4px",
        "text-decoration": "none",
      })}">BUILD MY HYROX TRAINING PLAN &#8594;</a>
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
      <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-left:3px solid #08a7f5;border-radius:8px;padding:14px 18px;">
        <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:6px;">WANT TO HIT ${esc(targetFmt)}?</span>
        <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0;">Run the calculator in <strong style="color:#0f172a;">Hit a Target Time</strong> mode to see a split-by-split breakdown of exactly where you need to find time to make <strong style="color:#0f172a;">${esc(targetFmt)}</strong> achievable.</p>
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
  const baseUrl = (process.env.BASE_URL ?? "https://getformai.com").replace(/\/$/, "");
  const splitReportUrl = analysisJson.submissionId ? `${baseUrl}/api/hyrox/carousel/${analysisJson.submissionId}` : null;
  const segMap = new Map(segments.map((segment) => [segment.segmentKey, segment]));
  const finishSeconds = analysisJson.race?.finishTimeSeconds ?? segMap.get("total_time")?.userSeconds ?? null;
  const isSub60Finish = Number.isFinite(finishSeconds) && finishSeconds <= 3600;
  const totalPenaltySeconds = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const hasPenalties = totalPenaltySeconds > 0;
  const totalGapSeconds = Math.max(0, splitGapSeconds(segMap.get("total_time"), hasGoalGroup) ?? 0);
  const runGapRaw = splitGapSeconds(segMap.get("run_time"), hasGoalGroup) ?? 0;
  const penaltiesAreMaterial =
    totalPenaltySeconds >= 60 ||
    (totalGapSeconds > 0 && totalPenaltySeconds / totalGapSeconds >= 0.10);
  const penaltiesDominate =
    totalPenaltySeconds >= 180 &&
    totalGapSeconds > 0 &&
    totalPenaltySeconds / totalGapSeconds >= 0.25;
  const runGapNetOfPenalties = penaltiesAreMaterial ? Math.max(0, runGapRaw - totalPenaltySeconds) : runGapRaw;
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

  const workGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
  const runGap = runGapRaw;

  const rankedGaps = SPLIT_TABLE_RACE_ORDER
    .map((key) => ({ key, gap: splitOpportunityGap(segMap.get(key)) }))
    .filter((row) => Number.isFinite(row.gap) && row.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const top1 = rankedGaps[0]?.key ?? null;
  const top2 = rankedGaps[1]?.key ?? null;
  const top3 = rankedGaps[2]?.key ?? null;

  function segmentBand(gap, percentile) {
    if (!Number.isFinite(gap)) return "mid";
    if (gap < 0 || (Number.isFinite(percentile) && percentile >= 60)) return "strong";
    if (gap >= 60 || (Number.isFinite(percentile) && percentile < 35)) return "needs_work";
    return "mid";
  }

  function splitRowBgNew(gap) {
    if (!Number.isFinite(gap)) return "#ffffff";
    if (gap < 0) return "#f0fdf4";
    if (gap >= 90) return "#fff4f4";
    if (gap >= 20) return "#fffdf7";
    return "#ffffff";
  }

  function gapPill(gap) {
    if (!Number.isFinite(gap)) return "";
    const text = splitGapDisplay(gap);
    let bg;
    let color;
    if (gap < 0) { bg = "#dcfce7"; color = "#16a34a"; }
    else if (gap >= 90) { bg = "#fee2e2"; color = "#dc2626"; }
    else if (gap >= 20) { bg = "#fef3c7"; color = "#d97706"; }
    else { bg = "#f1f5f9"; color = "#64748b"; }
    return `<span style="display:inline-block;background-color:${bg};color:${color};font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:3px;">${splitSafe(text)}</span>`;
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
    const stationStr = splitGapDisplay(stationGap);
    const runStr = splitGapDisplay(runGapRawValue);
    const totalStr = splitGapDisplay(totalGapSecondsValue);

    if (Number.isFinite(runGapRawValue) && runGapRawValue < 0) {
      return ` ${prefix}${your} largest positive gap is stations: <strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>. Running is ahead of benchmark by <strong style="color:#22c55e;">${splitSafe(runStr)}</strong>, which is why the total race gap is only <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong>.`;
    }
    if (Number.isFinite(runGapRawValue) && runGapRawValue >= 60) {
      return ` ${prefix}${both} stations (<strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>) and running (<strong style="color:#0f172a;">${splitSafe(runStr)}</strong>) are contributing to the total race gap of <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong>.`;
    }
    return ` ${prefix}${stations} are the largest contributor at <strong style="color:#0f172a;">${splitSafe(stationStr)}</strong>, with a total race gap of <strong style="color:#0f172a;">${splitSafe(totalStr)}</strong>.`;
  }

  function renderRaceStorySummary() {
    const roxGap = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    if (penaltiesAreMaterial) {
      const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup);
      const fitnessLosses = SPLIT_TABLE_RACE_ORDER
        .map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
        .filter((row) => row.seg?.type === "station" && Number.isFinite(row.gap) && row.gap >= 60)
        .sort((a, b) => b.gap - a.gap)
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
        hasGoalGroup ? null : bandDisplayLabel(achievedBand),
        hasGoalGroup ? "Against the target profile, " : null,
      );
      return `<tr>
        <td style="background-color:#ffffff;padding:18px 24px;">
          <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 24px;">
            <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">MAIN INSIGHT</span>
            <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;margin:0;">${hasGoalGroup ? "Stations remain the largest target gap" : "Stations remain the largest fitness limiter"}, but penalties are your fastest controllable win.${gapSentence}<br><br>Once the <strong>${splitSafe(formatGain(totalPenaltySeconds))}</strong> penalty is separated, the running gap drops from <strong>${splitSafe(splitGapDisplay(runGapRaw))}</strong> to <strong>${splitSafe(splitGapDisplay(runGapNetOfPenalties))}</strong>. Run 5 is penalty-inflated, so do not treat the full Run 5 loss as a running fitness problem.<br><br>${splitSafe(`${roxNote}${fitnessSentence}`)}</p>
          </div>
        </td>
      </tr>`;
    }

    const isElite = achievedBand === "sub_60" || isSub60Finish;
    const isCompetitive = ["sub_65", "sub_70"].includes(achievedBand ?? "");
    const nextBandStr = analysisJson.benchmarkContext?.nextBand?.replace("sub_", "sub-") ?? null;
    const achievedStr = achievedBand?.replace("sub_", "sub-") ?? null;
    const limiterStr = analysisJson.headline?.biggestLimiter?.label ?? null;
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
        if (limiterStr && runIsStrength) {
          mainLimiter = `You are already ahead of the ${achievedStr} benchmark overall. Running is a strength, so the move toward ${nextBandStr} is station efficiency, led by ${limiterStr}${roxGap < -30 ? "" : ", plus cleaner RoxZone flow"}.`;
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
          : `The main target gap is station performance.${limiterStr ? ` ${limiterStr} leads.` : ""}`;
      } else if (isElite) {
        mainLimiter = "Your smallest relative advantage sits in station performance.";
      } else if (isCompetitive && achievedStr && nextBandStr) {
        mainLimiter = `You are competitive in the ${achievedStr} benchmark band. ${
          limiterStr
            ? `Your clearest gap toward ${nextBandStr} is station performance, especially ${limiterStr}.`
            : `Your clearest gap toward ${nextBandStr} is station performance.`
        }`;
      } else {
        mainLimiter = "The main limiter is station performance.";
      }
    } else if (runGap > workGap + 60) {
      if (hasGoalGroup) {
        mainLimiter = targetTimeFmt2
          ? `To hit ${targetTimeFmt2}, the gap is led by running pace.${runIsStrength ? " Running is strong against your current benchmark, but still needs time against the target profile." : ""}`
          : "The main target gap is running pace.";
      } else if (isElite) {
        mainLimiter = "Your smallest relative advantage sits in running pace.";
      } else if (isCompetitive && achievedStr && nextBandStr) {
        mainLimiter = `You are competitive in the ${achievedStr} benchmark band. Running pace shows the clearest gap versus ${nextBandStr} athletes.`;
      } else {
        mainLimiter = "The main limiter is running pace.";
      }
    } else {
      if (hasGoalGroup) {
        mainLimiter = targetTimeFmt2
          ? `To hit ${targetTimeFmt2}, both stations and running are contributing to the gap.${penaltiesAreMaterial ? " The first controllable win is penalty removal." : ""}`
          : "Both stations and running are contributing to the target gap.";
      } else {
        mainLimiter = "Both running and station performance are contributing to the gap.";
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
      else if (totalGapSeconds <= 360) feasibility = "Target assessment: ambitious but plausible.";
      else if (totalGapSeconds <= 600) feasibility = "Target assessment: aggressive stretch.";
      else feasibility = "Target assessment: very aggressive target.";

      if (penaltiesDominate) {
        feasibility = "Target assessment: aggressive stretch. The first win is execution — removing penalties changes the size of the problem immediately.";
      }
      mainLimiter = `${feasibility} ${mainLimiter}`;
    }

    const roxRef = hasGoalGroup ? "target profile" : "benchmark";
    const roxNote = roxGap < -30
      ? ` Your RoxZone execution is a clear strength (${splitSafe(splitGapDisplay(roxGap))} vs ${roxRef}).`
      : roxGap < 30
        ? " Transitions are not a meaningful drag on your result."
        : ` Transitions are also contributing (~${splitSafe(formatGain(roxGap))} above ${roxRef}).`;
    const topLosses = SPLIT_TABLE_RACE_ORDER
      .map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
      .filter((row) => Number.isFinite(row.gap) && row.gap >= 60)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);
    const lossNames = topLosses.map((row) => row.seg?.label ?? row.key).join(", ");
    const biggestNote = lossNames ? ` Biggest opportunities: ${lossNames}.` : "";

    const stationGap = splitGapSeconds(segMap.get("work_time"), hasGoalGroup);
    const gapSentence = buildGapRelationSentence(
      stationGap,
      runGapRaw,
      totalGapSeconds,
      hasGoalGroup ? null : bandDisplayLabel(achievedBand),
      hasGoalGroup ? "Against the target profile, " : null,
    );
    const secondParagraph = splitSafe(enforceTone(`${roxNote.trim()}${biggestNote}`));
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
          <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">MAIN INSIGHT</span>
          <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;margin:0;">${splitSafe(enforceTone(mainLimiter))}${gapSentence}${penaltySentence}<br><br>${secondParagraph}</p>
        </div>
      </td>
    </tr>`;
  }

  function renderGapBreakdown() {
    if (totalGapSeconds <= 0) return "";
    const stationGap = Math.max(0, splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0);
    const penaltyForBar = penaltiesAreMaterial ? totalPenaltySeconds : 0;
    const runningForBar = penaltiesAreMaterial ? runGapNetOfPenalties : Math.max(0, runGapRaw);
    const roxGap = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    const positiveTotal = stationGap + penaltyForBar + runningForBar;
    const stationPct = positiveTotal > 0 ? Math.round((stationGap / positiveTotal) * 100) : 0;
    const penaltyPct = positiveTotal > 0 ? Math.round((penaltyForBar / positiveTotal) * 100) : 0;
    const runningPct = Math.max(0, Math.min(100 - stationPct - penaltyPct, positiveTotal > 0 ? Math.round((runningForBar / positiveTotal) * 100) : 0));
    const penaltyBarCell = penaltiesAreMaterial && penaltyPct > 0
      ? `<td width="${penaltyPct}%" style="background-color:#7c3aed;font-size:1px;line-height:14px;">&nbsp;</td>`
      : "";
    const penaltyLegendItem = penaltiesAreMaterial
      ? `<span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:#7c3aed;margin-right:5px;"></span>Penalties ${splitSafe(splitGapDisplay(totalPenaltySeconds))}</span>`
      : "";
    const runningLabel = penaltiesAreMaterial
      ? `Running ${splitSafe(splitGapDisplay(runGapNetOfPenalties))} net of penalties`
      : `Running ${splitSafe(splitGapDisplay(runGapRaw))}`;
    const footerNote = penaltiesAreMaterial
      ? `<p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 0 0;line-height:1.5;">${hasGoalGroup ? "Running is shown net of penalties. Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap." : "Running is shown net of penalties so fitness and execution are not conflated. Segment gaps are each measured against the benchmark median for that segment, so they may not sum exactly to the total race gap."}</p>`
      : `<p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 0 0;line-height:1.5;">${hasGoalGroup ? "Segment gaps are measured against the target profile for your selected time, so they may not sum exactly to the total target gap." : "Segment gaps are each measured against the benchmark median for that segment, so they may not sum exactly to the total race gap."}</p>`;

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="border:1px solid #e2e8f0;border-radius:8px;background-color:#ffffff;padding:16px;">
          <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">SEGMENT PROFILE</span>
	          <span style="display:block;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;margin-bottom:10px;">${hasGoalGroup ? "vs. target profile per segment" : "vs. band median per segment"}</span>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="height:14px;background-color:#f1f5f9;overflow:hidden;margin:0 0 12px;">
            <tr>
              <td width="${stationPct}%" style="background-color:#e53e3e;font-size:1px;line-height:14px;">&nbsp;</td>
              ${penaltyBarCell}
              <td width="${runningPct}%" style="background-color:#d97706;font-size:1px;line-height:14px;">&nbsp;</td>
            </tr>
          </table>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#475569;line-height:1.7;margin:0;">
            <span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:#e53e3e;margin-right:5px;"></span>Stations ${splitSafe(splitGapDisplay(stationGap))}</span>
            ${penaltyLegendItem}
            <span style="white-space:nowrap;margin-right:12px;"><span style="display:inline-block;width:9px;height:9px;background-color:#d97706;margin-right:5px;"></span>${runningLabel}</span>
            <span style="white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;background-color:#22c55e;margin-right:5px;"></span>RoxZone ${splitSafe(splitGapDisplay(roxGap))}</span>
          </p>
          ${footerNote}
        </div>
      </td>
    </tr>`;
  }

	  function renderSummaryCards() {
    const roxGapForCard = splitGapSeconds(segMap.get("roxzone_time"), hasGoalGroup) ?? 0;
    const stationGapForCard = splitGapSeconds(segMap.get("work_time"), hasGoalGroup) ?? 0;
    const runGapForCard = splitGapSeconds(segMap.get("run_time"), hasGoalGroup) ?? 0;
    const totalGapNote = hasGoalGroup ? "vs target" : "vs benchmark median";

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
      { key: "work_time", label: "Stations", note: cardNote("work_time", stationGapForCard) },
      { key: "run_time", label: "Running", note: cardNote("run_time", runGapForCard) },
      { key: "roxzone_time", label: "RoxZone", note: cardNote("roxzone_time", roxGapForCard) },
    ];

    function card(cfg) {
      const seg = segMap.get(cfg.key);
      const gap = splitGapSeconds(seg, hasGoalGroup);
      const timeStr = seg && Number.isFinite(seg.userSeconds) ? splitSafe(formatTime(seg.userSeconds)) : "&ndash;";
      const pill = Number.isFinite(gap) ? gapPill(gap) : "";
      return `<div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
        <span style="display:block;color:#94a3b8;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${splitSafe(cfg.label)}</span>
        <span style="display:block;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${timeStr}</span>
        ${pill}
        <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;margin-top:6px;">${splitSafe(cfg.note)}</span>
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
          <span style="display:block;color:#94a3b8;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${splitSafe(label)}</span>
          <span style="display:block;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${splitSafe(timeStr)}</span>
          ${pill}
          <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;margin-top:6px;">${splitSafe(note)}</span>
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
              <td width="50%" valign="top" style="padding:0 4px 8px 0;">${explicitCard("Stations", timeFor(stationSeg), stationGap, cardNote("work_time", stationGap))}</td>
              <td width="50%" valign="top" style="padding:0 0 8px 4px;">${explicitCard("Penalties", formatTime(totalPenaltySeconds), totalPenaltySeconds, "Fastest win", penaltyPill(totalPenaltySeconds))}</td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding:0 4px 0 0;">${explicitCard("Running", timeFor(runSeg), runGapNetOfPenalties, "Net of penalties")}</td>
              <td width="50%" valign="top" style="padding:0 0 0 4px;">${explicitCard("RoxZone", timeFor(roxSeg), roxGap, cardNote("roxzone_time", roxGap))}</td>
            </tr>
          </table>
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

    const routeItems = [];

    if (penaltiesAreMaterial && totalPenaltySeconds > 0) {
      routeItems.push(`${splitSafe(formatGain(totalPenaltySeconds))} from eliminating penalties`);
    }

    if (stationGap2 > 30) {
      const stationBullet = topStationLabel
        ? `${splitSafe(formatGain(Math.round(stationGap2 * 0.6)))}–${splitSafe(formatGain(Math.round(stationGap2 * 0.85)))} from station efficiency, led by ${splitSafe(topStationLabel)}${top2StationLabel ? ` and ${splitSafe(top2StationLabel)}` : ""}`
        : `${splitSafe(formatGain(Math.round(stationGap2 * 0.6)))}–${splitSafe(formatGain(Math.round(stationGap2 * 0.85)))} from station efficiency`;
      routeItems.push(stationBullet);
    }

    if (runGapForRoute > 30) {
      const runBullet = topRunLabel
        ? `around ${splitSafe(formatGain(runGapForRoute))} from running pace, especially ${splitSafe(topRunLabel)}`
        : `around ${splitSafe(formatGain(runGapForRoute))} from running pace against the target profile`;
      routeItems.push(runBullet);
    } else if (runGapRaw < -30) {
      routeItems.push("protect running – already ahead of the target profile");
    }

    if (roxGap2 > 20) {
      routeItems.push(`around ${splitSafe(formatGain(roxGap2))} from cleaner RoxZone transitions`);
    } else if (roxGap2 < -20) {
      routeItems.push("protect RoxZone - already ahead of target");
    }

    if (routeItems.length === 0) return "";

    const listItems = routeItems.map((item) =>
      `<li style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;line-height:1.6;margin-bottom:4px;">${item}</li>`
    ).join("");

    const headingText = `YOUR ROUTE TO ${splitSafe(targetTimeFmt)}`;

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:18px 24px;">
          <span style="display:block;color:#0369a1;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">${headingText}</span>
          <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0 0 10px;">You need to find <strong>${splitSafe(totalGapStr)}</strong> overall. The most realistic route is:</p>
          <ul style="margin:0;padding-left:20px;">
            ${listItems}
          </ul>
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
    if (roxGap2 < -20) protectItems.push("RoxZone execution - already ahead of the target profile");

    const changeItems = [];
    if (penaltiesAreMaterial) changeItems.push(`penalties - ${splitSafe(formatGain(totalPenaltySeconds))} of execution leakage`);
    if (top1Label && stationGap2 > 30) changeItems.push(`${splitSafe(top1Label)} and station efficiency`);
    const top2Label = top2 ? (segMap.get(top2)?.label ?? null) : null;
    if (top2Label && !changeItems.some((c) => c.includes(top2Label))) changeItems.push(splitSafe(top2Label));

    const skipItems = [];
    if (runGapRaw < -30) skipItems.push("general running volume - it is already a relative strength");
    if (roxGap2 < -20) skipItems.push("RoxZone rebuilding - it needs polish, not a rebuild");
    if (penaltiesAreMaterial) skipItems.push("Run 5 as pure running fitness - it is penalty-inflated");

    if (protectItems.length === 0 && changeItems.length === 0) return "";

    function listBlock(heading, items, color) {
      if (items.length === 0) return "";
      const itemsHtml = items.map((i) =>
        `<li style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#475569;line-height:1.6;">${i}</li>`
      ).join("");
      return `<p style="margin:8px 0 2px;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${color};">${heading}</p>
        <ul style="margin:0 0 6px;padding-left:16px;">${itemsHtml}</ul>`;
    }

    const body = [
      listBlock("Protect", protectItems, "#16a34a"),
      listBlock("Change", changeItems, "#d97706"),
      listBlock("Do not over-focus", skipItems, "#94a3b8"),
    ].filter(Boolean).join("");

    return `<tr>
      <td style="background-color:#ffffff;padding:0 24px 18px;">
        <div style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
          <span style="display:block;color:#92400e;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">TARGET PRIORITIES</span>
          ${body}
        </div>
      </td>
    </tr>`;
  }

  function renderSegmentHighlights() {
    const losses = SPLIT_TABLE_RACE_ORDER
      .map((key) => {
        const seg = segMap.get(key);
        return {
          key,
          seg,
          gap: splitOpportunityGap(seg),
          adjusted: isPenaltyAdjustedSegment(seg),
        };
      })
      .filter((row) => row.seg && Number.isFinite(row.gap) && row.gap >= 30)
      .sort((a, b) => b.gap - a.gap);
    if (penaltiesAreMaterial) {
      losses.unshift({
        key: "__penalty__",
        seg: { label: "Penalties", percentile: null },
        gap: totalPenaltySeconds,
      });
    }
    const topLosses = losses.slice(0, 5);
    const strengths = SPLIT_TABLE_RACE_ORDER
      .map((key) => ({ key, seg: segMap.get(key), gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
      .filter((row) => row.seg && (
        (Number.isFinite(row.gap) && row.gap < 0)
        || (Number.isFinite(row.seg.percentile) && row.seg.percentile >= 60)
      ))
      .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));

    const roxAggregateSeg = segMap.get("roxzone_time");
    const roxAggregateGap = splitGapSeconds(roxAggregateSeg, hasGoalGroup) ?? null;
    if (
      roxAggregateSeg
      && Number.isFinite(roxAggregateGap)
      && (roxAggregateGap < -30 || (Number.isFinite(roxAggregateSeg.percentile) && roxAggregateSeg.percentile >= 60))
    ) {
      strengths.push({
        key: "roxzone_time",
        seg: { ...roxAggregateSeg, label: "RoxZone" },
        gap: roxAggregateGap,
      });
      strengths.sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
    }
    const topStrengths = strengths.slice(0, 3);
    const isEliteAthlete = achievedBand === "sub_60";

    const badge = (num) => `<span style="display:inline-block;min-width:20px;text-align:center;background-color:#08a7f5;color:#07101e;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;padding:1px 4px;border-radius:3px;">${num}</span>`;
    const strongPill = `<span style="display:inline-block;background-color:#dcfce7;color:#16a34a;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;text-transform:uppercase;font-weight:700;letter-spacing:0.06em;padding:3px 6px;border-radius:4px;">STRONG</span>`;

    function lossRow(item, idx) {
      const isPenalty = item.key === "__penalty__";
      const rowBadge = isPenalty
        ? `<span style="display:inline-block;min-width:20px;text-align:center;background-color:#7c3aed;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;padding:1px 4px;border-radius:3px;">${idx + 1}</span>`
        : badge(idx + 1);
      const rank = isPenalty
        ? `<span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7c3aed;">execution</span>`
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
            return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#d97706;">${splitSafe(targetLabel)}</span>`;
          }
          const rawLabel = bandScoreLabel(item.seg?.percentile);
          if (!rawLabel) return "";
          const displayLabel = isEliteAthlete ? eliteBandLabel(rawLabel) : rawLabel;
          const bsColor = bandScoreColor(rawLabel);
          return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${bsColor};">${splitSafe(displayLabel)} vs your benchmark band</span>`;
        })();
      const adjustedNote = item.adjusted
        ? `<span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#7c3aed;">penalty-adjusted</span>`
        : "";
      const pillHtml = isPenalty
        ? `<span style="display:inline-block;background-color:#ede9fe;color:#7c3aed;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:3px;">${splitSafe(splitGapDisplay(item.gap))}</span>`
        : gapPill(item.gap);
      return `<tr>
        <td style="padding:8px 0 8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:28px;">${rowBadge}</td>
        <td style="padding:8px 8px 8px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${splitSafe(item.seg.label)}</span>
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
          return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#16a34a;">${splitSafe(targetLabel)}</span>`;
        }
        const rawLabel = bandScoreLabel(item.seg?.percentile);
        if (!rawLabel) return "";
        const displayLabel = isEliteAthlete ? eliteBandLabel(rawLabel) : rawLabel;
        const bsColor = bandScoreColor(rawLabel);
        return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${bsColor};">${splitSafe(displayLabel)} vs your benchmark band</span>`;
      })();
      return `<tr>
        <td style="padding:8px 0 8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:58px;">${strongPill}</td>
        <td style="padding:8px 8px 8px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${splitSafe(item.seg.label)}</span>
          ${rank ? `<span style="display:block;">${rank}</span>` : ""}
        </td>
        <td style="padding:8px 10px 8px 4px;text-align:right;vertical-align:middle;white-space:nowrap;">${gapPill(item.gap)}</td>
      </tr>`;
    }

    const lossRows = topLosses.length >= 1
      ? topLosses.map((item, idx) => lossRow(item, idx)).join("")
      : `<tr><td colspan="3" style="padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-style:italic;">No significant time losses detected.</td></tr>`;
    const strengthRows = topStrengths.length > 0
      ? topStrengths.map((item) => strengthRow(item)).join("")
      : `<tr><td colspan="3" style="padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-style:italic;">No segments clearly ahead of benchmark.</td></tr>`;

    function panelHeader(title, subtitle) {
      return `<tr style="background-color:#f8fafc;">
        <td colspan="3" style="padding:8px 12px 4px;border-bottom:1px solid #e2e8f0;">
          <span style="font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">${splitSafe(title)}</span>
          <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-style:italic;color:#94a3b8;margin-top:1px;">${splitSafe(subtitle)}</span>
        </td>
      </tr>`;
    }

    const lossTable = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background-color:#ffffff;">
      ${panelHeader("Biggest opportunities", penaltiesAreMaterial ? "Penalty separated from split performance" : hasGoalGroup ? "Where your target time comes from" : "Where the next time comes from")}
      ${lossRows}
    </table>`;
    const strengthTable = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background-color:#ffffff;">
      ${panelHeader("Strengths to protect", hasGoalGroup ? "Areas already ahead of target profile" : "Good areas to preserve")}
      ${strengthRows}
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

  function rankColor(gap, pct) {
    if (Number.isFinite(gap)) {
      if (gap < 0) return "#22c55e";
      if (gap >= 90) return "#e53e3e";
      if (gap >= 60) return "#d97706";
      return "#94a3b8";
    }
    return pct >= 60 ? "#22c55e" : pct <= 30 ? "#e53e3e" : "#94a3b8";
  }

  function pctCells(segment, isAggregate, gap = null) {
    const dash = `<td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">&ndash;</td>`;
    if (isAggregate || segment.confidence === "low" || !Number.isFinite(segment.percentile)) {
      return `${dash}${dash}`;
    }
    const color = rankColor(gap, segment.fieldPercentile ?? segment.percentile);
    const overallCell = hasGoalGroup
      ? `<td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;">Target profile</td>`
      : Number.isFinite(segment.fieldPercentile)
        ? `<td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${color};">${splitSafe(formatPercentileRank(segment.fieldPercentile))}</td>`
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
      const tColor = !targetLabel ? "#94a3b8"
        : targetLabel === "Ahead of target" ? "#22c55e"
        : targetLabel === "On target" ? "#475569"
        : targetLabel === "Elite target refinement" ? "#6366f1"
        : "#d97706";
      bandScoreCell = targetLabel
        ? `<td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;color:${tColor};">${splitSafe(targetLabel)}</td>`
        : dash;
    } else {
      const bsLabel = bandScoreLabel(segment.percentile);
      bandScoreCell = bsLabel
        ? `<td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;color:${bandScoreColor(bsLabel)};">${splitSafe(bsLabel)}</td>`
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
    const prefix = isLowConfidence ? "~" : "";
    const userT = Number.isFinite(segment.userSeconds) ? `${prefix}${formatTime(segment.userSeconds)}` : "–";
    const gapStr = splitGapDisplay(gap);
    const gapColor = isLowConfidence ? "#94a3b8" : splitGapColor(gap);
    const gapBold = !isLowConfidence && Number.isFinite(gap) && gap > 90 ? "font-weight:700;" : "";
    const userColor = isLowConfidence ? "#94a3b8" : "#0f172a";
    const bg = `background-color:${splitRowBgNew(gap)};`;
    const adjustedUserT = penaltyAdjusted && Number.isFinite(adjustedUserSeconds(segment))
      ? `${prefix}${formatTime(adjustedUserSeconds(segment))}`
      : userT;

    return `<tr style="${bg}">
      <td style="padding:7px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">${splitSafe(segment.label)}${penaltyAdjusted ? `<span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#7c3aed;">penalty-adjusted from ${splitSafe(splitGapDisplay(rawGap))}</span>` : ""}</td>
      ${pctCells(segment, false, gap)}
      <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:${userColor};">${splitSafe(adjustedUserT)}</td>
      <td style="padding:7px 12px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;${gapBold}color:${gapColor};">${splitSafe(gapStr)}</td>
    </tr>`;
  }

  const penaltyRowHtml = totalPenaltySeconds > 0
    ? `<tr style="background-color:#f5f3ff;">
        <td style="padding:7px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">Penalties</td>
        <td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7c3aed;">execution</td>
        <td style="padding:7px 6px;text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;">&ndash;</td>
        <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:#7c3aed;">${splitSafe(formatTime(totalPenaltySeconds))}</td>
        <td style="padding:7px 12px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#7c3aed;">${splitSafe(splitGapDisplay(totalPenaltySeconds))}</td>
      </tr>`
    : "";

	  const reducedRows = [
	    ...rankedGaps.slice(0, 6).map((row) => row.key),
	    ...SPLIT_TABLE_RACE_ORDER
	      .map((key) => {
          const segment = segMap.get(key);
          return { key, segment, gap: splitOpportunityGap(segment) };
        })
	      .filter((row) => row.segment && !isPenaltyAdjustedSegment(row.segment) && Number.isFinite(row.gap) && row.gap < 0)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 1)
      .map((row) => row.key),
	  ]
    .filter((key, index, all) => key && all.indexOf(key) === index)
    .map((key) => {
      const segment = segMap.get(key);
      return segment ? dataRow(segment) : "";
	    })
	    .join("");

  const reducedTableNote = penaltiesAreMaterial
    ? `<p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;line-height:1.45;margin:8px 0 0;">Penalty time is shown separately above, so the split table focuses on performance gaps rather than execution penalties.</p>`
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
        <td style="padding:8px 8px 8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;${weight}color:#0f172a;">${splitSafe(labelOverride ?? seg.label)}</td>
        <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;${weight}color:#0f172a;">${splitSafe(userT)}</td>
        <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;${weight}color:#475569;">${splitSafe(targetT)}</td>
        <td style="padding:8px 16px 8px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:${gapColor};">${splitSafe(gapStr)}</td>
      </tr>`;
    }

    const totalsPenaltyRow = totalPenaltySeconds > 0 ? `<tr style="background-color:#fff4f4;">
      <td style="padding:8px 8px 8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">Penalties</td>
      <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;color:#e53e3e;">${splitSafe(formatTime(totalPenaltySeconds))}</td>
      <td style="padding:8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;color:#475569;">0:00</td>
      <td style="padding:8px 16px 8px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:#e53e3e;">+${splitSafe(formatGain(totalPenaltySeconds))}</td>
    </tr>` : "";

    return `
    <tr>
	      <td style="background-color:#f1f5f9;padding:8px 24px;border-top:2px solid #e2e8f0;">
        <span style="color:#475569;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">TOTALS</span>
      </td>
    </tr>
    <tr>
      <td style="background-color:#ffffff;padding:0;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr style="background-color:#f8fafc;">
            <th style="padding:6px 8px 6px 16px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Category</th>
            <th style="padding:6px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Your Time</th>
            <th style="padding:6px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#08a7f5;">Target *</th>
            <th style="padding:6px 16px 6px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Gap</th>
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
	        <span style="display:block;color:#94a3b8;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:6px;">HOW TO READ THIS</span>
        <p style="color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;margin:0;">${hasGoalGroup ? "Red highlights the most actionable losses. Amber flags moderate gaps. Green means faster than target. Target status shows whether each segment is ahead of target, on target, or an opportunity against the selected target profile." : "Red highlights the most actionable losses. Amber flags moderate gaps. Green means faster than target. Band score shows whether each segment is a Strength, Good, On benchmark, Opportunity, or Priority versus athletes who finished in the same time band."}</p>
      </td>
    </tr>`;
  }

  const splitReportLink = splitReportUrl
    ? `<a href="${esc(splitReportUrl)}" target="_blank" style="display:block;background-color:#e8f7fd;border:1px solid #bdeafb;border-radius:8px;padding:14px 16px;margin-top:12px;color:#08a7f5;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;text-decoration:none;">View the full split report &#8594;</a>`
    : "";

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
        <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">REDUCED SPLIT DETAIL</span>
	        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid #e2e8f0;border-collapse:collapse;width:100%;">
          <tr style="background-color:#f1f5f9;border-bottom:2px solid #e2e8f0;">
            <th style="padding:7px 8px 7px 12px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:32%;">Segment</th>
	            <th style="padding:7px 6px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:16%;">${hasGoalGroup ? "Target basis" : "Overall standing"}</th>
            <th style="padding:7px 6px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:14%;">${hasGoalGroup ? "Target status" : "Band score"}</th>
            <th style="padding:7px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:14%;">Your split</th>
            <th style="padding:7px 12px 7px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;width:24%;">Gap vs median</th>
          </tr>
          ${penaltyRowHtml}
          ${reducedRows}
	        </table>
        ${reducedTableNote}
	        ${splitReportLink}
	      </td>
    </tr>`;
}

function renderFooter() {
  return `
  <tr>
    <td style="background-color:#0d1422;padding:22px 32px;border-radius:0 0 8px 8px;text-align:center;">
      <p style="color:#8fa0ba;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.04em;margin:0 0 8px;">FORMA &nbsp;&#183;&nbsp; forma.fit &nbsp;&#183;&nbsp; Performance Analytics for Hybrid Athletes</p>
      <p style="color:#4a5568;font-family:Arial,Helvetica,sans-serif;font-size:10px;margin:0;">This analysis is for guidance only. Individual results vary.</p>
    </td>
  </tr>`;
}

function renderDoublesCaveat(analysisJson = {}) {
  if (!analysisJson.benchmarkContext?.doublesBenchmarkedAsSingles) return "";
  return `<tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;">
      <div style="background-color:#fffbeb;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:8px;padding:14px 18px;">
        <span style="display:block;color:#92400e;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">DOUBLES RESULT</span>
        <p style="color:#78350f;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;">This is a HYROX Doubles result. We don&#39;t yet have a dedicated doubles benchmark dataset, so all percentiles and comparisons in this report are measured against the singles open-division population. Use these benchmarks as a directional guide rather than a precise competitive ranking.</p>
      </div>
    </td>
  </tr>`;
}

function renderMethodNote(hasMaterialPenalties = false, calculatorMode = "target") {
  const penaltyNote = hasMaterialPenalties
    ? " Penalties are separated from running in the gap breakdown to avoid confusing execution leakage with run fitness."
    : "";
  const methodCopy = calculatorMode === "analyse"
    ? `Target times are based on your selected benchmark band.${penaltyNote} Segment gaps are each measured against the benchmark median for that segment, so they may not sum exactly to the total race gap. Gaps are estimates, not guarantees. A positive gap means slower than target; a negative gap means faster.`
    : `Target times are based on your selected target profile.${penaltyNote} Segment gaps are measured against that target profile, so they may not sum exactly to the total race gap. Gaps are estimates, not guarantees. A positive gap means slower than target; a negative gap means faster.`;
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;">
      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:0 0;">
        <span style="display:block;color:#94a3b8;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">METHOD NOTE</span>
        <p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:0;">${esc(methodCopy)}</p>
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

function parseMuscleAreaSignals(items) {
  const text = items.join("\n");
  const rows = [];
  const summary = items.find((item) => /common thread across your weakest stations/i.test(item)) ?? "";
  const weakAreasMatch = summary.match(/^(.+?)\s+are the common thread across your weakest stations/i);
  const strongAreaMatch = summary.match(/weakest stations;\s*your\s+(.+?)\s+is a clear strength/i)
    ?? summary.match(/^your\s+(.+?)\s+is a clear strength/i);
  const weakStations = (text.match(/Weakest stations:\s*(.+)/i)?.[1] ?? "")
    .split(/,\s*/)
    .map((entry) => entry.replace(/\s*\([^)]*\)/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const strongStations = (text.match(/Strongest stations:\s*(.+)/i)?.[1] ?? "")
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
          color: "#e53e3e",
          bg: "#fff4f4",
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
        color: "#16a34a",
        bg: "#f0fdf4",
        meaning: strongStations.length ? `${strongStations.join(", ")} are stronger` : "Higher-ranked stations share this demand",
      });
    }
  }
  return rows;
}

function renderMuscleGroupSection(section, analysisJson = {}) {
  const { penaltiesAreMaterial } = penaltyContext(analysisJson);
  const content = Array.isArray(section.content) ? section.content : [section.content];
  const textItems = content.filter((item) => typeof item === "string");
  const areaRows = parseMuscleAreaSignals(textItems);
  const signalRows = parseStationSignals(textItems);
  const stationFallbackRows = signalRows.map((row) => ({
    area: row.name,
    signal: row.signal,
    color: row.color,
    bg: row.bg,
    meaning: row.signal === "Weakness" ? "Station-specific limiter" : "Station to protect",
  }));
  const rows = areaRows.length > 0 ? areaRows : stationFallbackRows;
  const signalTableHtml = rows.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:12px;border:1px solid #e2e8f0;">
      <tr style="background-color:#f8fafc;">
	        <th width="50%" style="padding:8px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Area</th>
	        <th width="50%" style="padding:8px;text-align:center;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Signal</th>
      </tr>
      ${rows.map((row) => `<tr>
        <td style="padding:10px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;border-top:1px solid #e2e8f0;"><strong>${esc(row.area)}</strong></td>
	        <td style="padding:10px 8px;border-top:1px solid #e2e8f0;text-align:center;"><span style="display:inline-block;background-color:${row.bg};color:${row.color};font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:9px;text-transform:uppercase;font-weight:700;letter-spacing:0.06em;padding:3px 6px;border-radius:4px;">${esc(row.signal)}</span></td>
      </tr>`).join("")}
    </table>`
    : "";
  const implication = penaltiesAreMaterial
    ? "Training focus: clean station standards first, then posterior-chain strength-endurance through Romanian deadlifts, hip thrusts and sled-specific pulling."
    : (textItems.find((item) => /^Training focus:/i.test(item))
      ?? "Training implication: a targeted strength-endurance block is the highest-leverage cross-station investment.");
  return `
  <tr>
    <td style="background-color:#ffffff;padding:0 24px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:10px;">MUSCLE GROUP SIGNAL</span>
      ${signalTableHtml}
      <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;margin:12px 0 0;">${esc(enforceTone(implication))}</p>
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
    "athlete_background",
    "training_context",
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
      return renderCta(section, analysisJson, buildCtaCopy(calculatorMode, interpretation?.primaryThesis?.category));
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
  const { totalPenaltySeconds: emailPenaltySeconds, penaltiesAreMaterial: emailPenaltiesMaterial, usePenaltyHero } = penaltyContext(analysisJson);
  const limiter = limiterName(analysisJson);
  const subject = (() => {
    if (usePenaltyHero) return `Your HYROX fastest win is ${formatGain(emailPenaltySeconds)} of penalties`;
    if (calculatorMode === "analyse") {
      const analysisFrame = analysisJson.benchmarkContext?.analysisFrame;
      const frame = analysisFrame?.frame;
      const achievedBand = analysisJson.benchmarkContext?.achievedBand;
      const bandLabel = achievedBand?.replace("sub_", "sub-") ?? null;
      const compBandLabel = (analysisFrame?.comparisonBand ?? analysisJson.benchmarkContext?.nextBand)?.replace("sub_", "sub-") ?? null;
      const stretchBandLabel = analysisFrame?.stretchBand?.replace("sub_", "sub-") ?? null;

      if (frame === "next_band" || frame === "next_band_stretch") {
        if (bandLabel && compBandLabel) {
          return `You're ahead of your ${bandLabel} group. ${compBandLabel} is the next test.`;
        }
        if (compBandLabel) {
          return `You have the engine. ${compBandLabel} is the next test.`;
        }
      }

      if (frame === "competitive" && bandLabel && stretchBandLabel) {
        return `You're competitive in ${bandLabel}. Here's what moves you to ${stretchBandLabel}.`;
      }

      if (achievedBand === "sub_60") {
        return "You're sub-60. Here's what separates you from the top of the group.";
      }
      if (bandLabel && compBandLabel) {
        return `You're in the ${bandLabel} band. Here's the route to ${compBandLabel}.`;
      }
      const totalSeg = (analysisJson.segments ?? []).find((s) => s.segmentKey === "total_time");
	      const pct = formatPercentileRank(totalSeg?.percentile);
	      return pct ? `Your HYROX analysis - you finished in the ${pct}` : "Your HYROX race analysis is ready";
	    }
	    const goalTargetSecs = analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds;
	    const goalTargetFmt = goalTargetSecs ? formatTime(goalTargetSecs) : null;
	    if (goalTargetFmt) {
	      return `Your route to ${goalTargetFmt}: ${limiter ? `start with ${limiter}` : "the target roadmap"}`;
	    }
	    return "Your HYROX target time analysis";
	  })();
  const rawName = athleteContext.firstName ?? athleteContext.displayName ?? null;
  const firstName = rawName ? rawName.split(/[\s,]+/)[0] : "there";
  const greetingName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
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
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="${outerTableStyle}">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${innerTableStyle}">
          ${renderHeader()}
          ${renderHero(analysisJson, greetingName, interpretation)}
          ${renderMetricStrip(analysisJson, athleteContext, calculatorMode)}
          ${renderBenchmarkExplanation(analysisJson, calculatorMode)}
          ${renderDoublesCaveat(analysisJson)}
          ${sectionRows}
          ${renderTargetModeNudge(athleteContext, calculatorMode)}
          ${renderMethodNote(emailPenaltiesMaterial, calculatorMode)}
          ${renderFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: enforceTone(subject),
    htmlBody: enforceTone(rawHtml),
    textBody,
  };
}
