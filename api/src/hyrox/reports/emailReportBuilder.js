import { enforceTone, formatGain, formatPercentile, formatTime } from "./copyFormatter.js";

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

function contentText(content) {
  if (Array.isArray(content)) return content.filter((item) => typeof item === "string").join("\n");
  return String(content ?? "");
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

function renderMuscleGroupSection(sectionData) {
  const content = Array.isArray(sectionData.content) ? sectionData.content : [sectionData.content];
  const textItems = content.filter((item) => typeof item === "string");
  const diagram = content.find((item) => item?.__type === "muscle_diagram_pair") ?? null;
  const textHtml = textItems
    .map((item) => `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0 0 8px;">${esc(enforceTone(String(item)))}</p>`)
    .join("");
  const diagramHtml = diagram
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:16px 0;">
        <tr>
          <td align="center">
            <table cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                <td style="width:248px;vertical-align:top;">${diagram.frontSvg}</td>
                <td style="width:16px;"></td>
                <td style="width:248px;vertical-align:top;">${diagram.backSvg}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">
              <span style="color:#ef4444;">&#9632;</span> Limiter &nbsp;
              <span style="color:#22c55e;">&#9632;</span> Asset &nbsp;
              <span style="color:#f97316;">&#9632;</span> Mixed &nbsp;
              <span style="color:#64748b;">&#9632;</span> Neutral
            </p>
          </td>
        </tr>
      </table>`
    : "";
  const titleText = esc(String(sectionData.title ?? "").toUpperCase());
  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 32px;border-top:1px solid #e2e8f0;">
      <span style="color:#475569;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${titleText}</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 32px 20px;border-bottom:1px solid #e2e8f0;">
      ${textHtml}${diagramHtml}
    </td>
  </tr>`;
}

function renderHero(analysisJson, greetingName) {
  const limiter = analysisJson.headline?.biggestLimiter ?? null;
  const gainSeconds = analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? null;
  const gain = gainSeconds != null ? formatGain(gainSeconds) : null;
  const headlineText = limiter
    ? `${esc(String(limiter.label ?? "").toUpperCase())} IS YOUR BIGGEST OPPORTUNITY`
    : "YOUR HYROX ANALYSIS IS READY";
  const heroNumber = gain
    ? `<div style="${inlineStyle({
        "font-family": "'Courier New',Courier,monospace",
        "font-size": "56px",
        "font-weight": "700",
        color: "#08a7f5",
        "line-height": "1",
        margin: "8px 0 12px",
      })}">${esc(gain)}</div>
      <div style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;margin-bottom:0;">estimated time opportunity against your benchmark group.</div>`
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
    </td>
  </tr>`;
}

function renderMetricStrip(analysisJson, athleteContext) {
  const totalSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const finishTime = formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "-";
  const division = esc(athleteContext.division ?? analysisJson.race?.division ?? analysisJson.athlete?.division ?? "-");
  const rank = esc(formatPercentile(totalSeg?.percentile) ?? "-");
  const penalties = analysisJson.penalties ?? [];
  const totalPenalty = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const hasPenalties = penalties.length > 0;

  const cellStyle = (borderRight = true) => inlineStyle({
    padding: "14px 14px",
    "text-align": "center",
    "vertical-align": "top",
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
  function metricCell(label, value, valueColor = "#0f172a", borderRight = true) {
    return `<td style="${cellStyle(borderRight)}">
      <span style="${labelStyle}">${esc(label)}</span>
      <span style="display:block;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:${valueColor};">${value}</span>
    </td>`;
  }
  const penaltyCell = hasPenalties
    ? metricCell("PENALTIES", totalPenalty > 0 ? esc(formatGain(totalPenalty) ?? "-") : "None", totalPenalty > 0 ? "#e53e3e" : "#22c55e", false)
    : "";

  return `<tr>
    <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          ${metricCell("FINISH TIME", esc(finishTime), "#0f172a", true)}
          ${metricCell("DIVISION", division, "#0f172a", true)}
          ${metricCell("OVERALL RANK", rank, "#0f172a", !hasPenalties)}
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
    <td style="background-color:#ffffff;padding:24px 32px 20px;border-bottom:1px solid #e2e8f0;">
      ${paragraphs}
    </td>
  </tr>`;
}

function renderStrengthCard(section) {
  const text = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 32px;border-top:1px solid #e2e8f0;border-left:3px solid #08a7f5;">
      <span style="color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">BIGGEST STRENGTH</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 32px 20px 35px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;margin:0;">${text}</p>
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
      <td style="padding:10px 32px;${borderBottom}font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;line-height:1.4;">
        ${safe}
      </td>
    </tr>`;
  }
  const stationRows = weakItems.map((item, index) => stationRow(item, index === weakItems.length - 1 && !strengthItem)).join("");
  const strengthRow = strengthItem
    ? `<tr>
        <td style="padding:10px 32px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#08a7f5;line-height:1.4;">
          ${esc(enforceTone(strengthItem))}
        </td>
      </tr>`
    : "";

  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 32px;border-top:1px solid #e2e8f0;">
      <span style="color:#475569;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">STATION BREAKDOWN</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:4px 0 0;border-bottom:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:8px 32px 4px;">${esc(preamble)}</p>
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
    <td style="background-color:#e8f7fd;padding:20px 32px;border-left:3px solid #08a7f5;border-right:3px solid #08a7f5;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
      <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:8px;">TIME POTENTIAL</span>
      <p style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderTextCard(section) {
  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
  const paragraphs = items
    .filter(Boolean)
    .map((item, index) => {
      const border = index > 0 ? "border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px;" : "";
      return `<p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;${border}">${esc(enforceTone(String(item)))}</p>`;
    })
    .join("");
  const titleText = esc(String(section.title ?? "").toUpperCase());
  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 32px;border-top:1px solid #e2e8f0;">
      <span style="color:#475569;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${titleText}</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 32px 20px;border-bottom:1px solid #e2e8f0;">
      ${paragraphs}
    </td>
  </tr>`;
}

function renderAthleteBackground(section) {
  const text = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  return `
  <tr>
    <td style="background-color:#f8fafc;padding:10px 32px;border-top:1px solid #e2e8f0;border-left:3px solid #08a7f5;">
      <span style="color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;">YOUR BACKGROUND IN CONTEXT</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:16px 32px 20px 35px;border-bottom:1px solid #e2e8f0;">
      <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;margin:0;">${text}</p>
    </td>
  </tr>`;
}

function renderRecommendations(section) {
  const items = Array.isArray(section.content) ? section.content : [String(section.content ?? "")];
  const horizonLine = items[0] ?? "";
  const recItems = items.slice(1);
  const richRecs = Array.isArray(section.richRecommendations) ? section.richRecommendations : null;
  function parsePriority(item) {
    const match = String(item).match(/^(\d+)\.\s+([^:]+):\s+([\s\S]+)$/);
    if (!match) return { num: "", title: item, rationale: "" };
    return { num: match[1], title: match[2].trim(), rationale: match[3].trim() };
  }
  const badge = (num) => `<span style="${inlineStyle({
    display: "inline-block",
    "background-color": "#08a7f5",
    color: "#07101e",
    "font-family": "'Courier New',Courier,monospace",
    "font-size": "11px",
    "font-weight": "700",
    padding: "2px 8px",
    "border-radius": "3px",
    "margin-right": "10px",
    "vertical-align": "middle",
  })}">${esc(num)}</span>`;
  const letters = ["a", "b", "c", "d"];
  function renderContributorsTable(contributors) {
    if (!Array.isArray(contributors) || contributors.length < 2) return "";
    const rows = contributors.map((contributor, index) => `<tr>
      <td style="padding:2px 32px 2px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#475569;line-height:1.5;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#08a7f5;margin-right:6px;">${esc(letters[index] ?? String(index + 1))}/</span>
        <strong style="color:#0f172a;">${esc(contributor.label)}</strong>
        <span> - ${esc(enforceTone(contributor.copy))}</span>
      </td>
    </tr>`).join("");
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:6px;">${rows}</table>`;
  }
  function renderRunGapNote(note) {
    if (!note) return "";
    return `<p style="color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-style:italic;margin:6px 32px 0 40px;">${esc(enforceTone(note))}</p>`;
  }
  function renderRichRecRow(item, isLast) {
    const borderBottom = isLast ? "" : "border-bottom:1px solid #f1f5f9;";
    return `<tr>
      <td style="padding:16px 32px;${borderBottom}background-color:#ffffff;">
        <div style="margin-bottom:6px;">
          ${badge(String(item.priority))}
          <span style="font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;vertical-align:middle;">${esc(enforceTone(item.title))}</span>
        </div>
        <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0 0 0 32px;">${esc(enforceTone(item.rationale ?? ""))}</p>
        ${renderContributorsTable(item.contributors)}
        ${renderRunGapNote(item.runGapNote)}
      </td>
    </tr>`;
  }
  const recRows = richRecs ? richRecs.map((item, index) => renderRichRecRow(item, index === richRecs.length - 1)).join("") : recItems.map((item, index) => {
    const { num, title, rationale } = parsePriority(item);
    const borderBottom = index === recItems.length - 1 ? "" : "border-bottom:1px solid #f1f5f9;";
    return `<tr>
      <td style="padding:16px 32px;${borderBottom}background-color:#ffffff;">
        <div style="margin-bottom:6px;">
          ${badge(num)}
          <span style="font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;vertical-align:middle;">${esc(enforceTone(title))}</span>
        </div>
        <p style="color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;margin:0 0 0 32px;">${esc(enforceTone(rationale))}</p>
      </td>
    </tr>`;
  }).join("");
  const horizonText = esc(String(horizonLine).replace(/:$/, ""));
  return `
  <tr>
    <td style="background-color:#0f172a;padding:12px 32px;">
      <span style="display:block;color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">RECOMMENDED FOCUS AREAS</span>
      ${horizonText ? `<span style="display:block;color:#8fa0ba;font-family:Arial,Helvetica,sans-serif;font-size:11px;margin-top:3px;">${horizonText}</span>` : ""}
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:0;border-bottom:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        ${recRows}
      </table>
    </td>
  </tr>`;
}

function renderCta(section, analysisJson = {}) {
  const ctaUrl = process.env.FORMA_CTA_URL ?? "https://forma.fit";
  const baseUrl = (process.env.BASE_URL ?? "https://getformai.com").replace(/\/$/, "");
  const submissionId = analysisJson.submissionId ?? null;
  const carouselUrl = submissionId ? `${baseUrl}/api/hyrox/carousel/${submissionId}` : null;
  const bodyText = esc(enforceTone(Array.isArray(section.content) ? section.content.join(" ") : String(section.content ?? "")));
  const carouselLink = carouselUrl
    ? `<p style="margin:16px 0 0;"><a href="${esc(carouselUrl)}" target="_blank" style="color:#08a7f5;font-family:Arial,Helvetica,sans-serif;font-size:13px;text-decoration:underline;">View your Instagram carousel slides &#8594;</a></p>`
    : "";
  return `
  <tr>
    <td style="background-color:#ffffff;padding:32px;text-align:center;border-bottom:1px solid #e2e8f0;">
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
      })}">BUILD YOUR TRAINING PLAN &#8594;</a>
      ${carouselLink}
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
  if (Number.isFinite(segment?.exactTargetSeconds)) return segment.exactTargetSeconds;
  if (hasGoalGroup && Number.isFinite(segment?.goalBenchmarkSeconds)) return segment.goalBenchmarkSeconds;
  return Number.isFinite(segment?.benchmarkMedianSeconds) ? segment.benchmarkMedianSeconds : null;
}

function splitGapSeconds(segment, hasGoalGroup) {
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
  const benchmarkLabel = goalGroup?.label ?? primaryGroup?.label ?? "your benchmark group";
  const segMap = new Map(segments.map((segment) => [segment.segmentKey, segment]));

  const rankedGaps = SPLIT_TABLE_RACE_ORDER
    .map((key) => ({ key, gap: splitGapSeconds(segMap.get(key), hasGoalGroup) }))
    .filter((row) => Number.isFinite(row.gap) && row.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const top1 = rankedGaps[0]?.key ?? null;
  const top2 = rankedGaps[1]?.key ?? null;
  const top3 = rankedGaps[2]?.key ?? null;

  function dataRow(segment, isAggregate = false) {
    const key = segment.segmentKey;
    const rowLabel = isAggregate ? (AGGREGATE_LABELS[key] ?? segment.label) : segment.label;
    const gap = splitGapSeconds(segment, hasGoalGroup);
    const targetSecs = splitTargetSeconds(segment, hasGoalGroup);
    const isLowConfidence = segment.confidence === "low";
    const prefix = isLowConfidence ? "~" : "";
    const userT = Number.isFinite(segment.userSeconds) ? `${prefix}${formatTime(segment.userSeconds)}` : "–";
    const targetT = Number.isFinite(targetSecs) ? formatTime(targetSecs) : "–";
    const gapStr = splitGapDisplay(gap);
    const gapColor = isLowConfidence ? "#94a3b8" : splitGapColor(gap);
    const gapBold = !isLowConfidence && Number.isFinite(gap) && gap > 90 ? "font-weight:700;" : "";
    const userColor = isLowConfidence ? "#94a3b8" : "#0f172a";
    const leftBorder = !isAggregate && (key === top1 || key === top2)
      ? "border-left:3px solid #e53e3e;"
      : "border-left:3px solid transparent;";
    const bg = isAggregate
      ? (key === "total_time" ? "background-color:#e2e8f0;" : "background-color:#f1f5f9;")
      : `background-color:${splitRowBg(key, gap, top1, top2, top3)};`;
    const weight = isAggregate ? "font-weight:700;" : "";
    const topBorder = isAggregate ? "border-top:2px solid #e2e8f0;" : "";

    return `<tr style="${bg}">
      <td style="${leftBorder}padding:7px 8px 7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;${weight}color:#0f172a;${topBorder}">${splitSafe(rowLabel)}</td>
      <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;${weight}color:${userColor};${topBorder}">${splitSafe(userT)}</td>
      <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;${weight}color:#475569;${topBorder}">${splitSafe(targetT)}</td>
      <td style="padding:7px 4px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;${gapBold}color:${gapColor};${topBorder}">${splitSafe(gapStr)}</td>
    </tr>`;
  }

  const raceRows = SPLIT_TABLE_RACE_ORDER
    .map((key) => {
      const segment = segMap.get(key);
      return segment ? dataRow(segment, false) : "";
    })
    .join("");

  const totalPenalty = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const penaltyRow = totalPenalty > 0
    ? `<tr style="background-color:#fff5f5;">
        <td style="border-left:3px solid #e53e3e;padding:7px 8px 7px 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;">Penalties</td>
        <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:#e53e3e;">${splitSafe(formatTime(totalPenalty))}</td>
        <td style="padding:7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;color:#475569;">0:00</td>
        <td style="padding:7px 4px 7px 8px;text-align:right;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#e53e3e;">+${splitSafe(formatGain(totalPenalty))}</td>
      </tr>`
    : "";

  const aggregateRows = SPLIT_TABLE_AGGREGATES
    .map((key) => {
      const segment = segMap.get(key);
      const row = segment ? dataRow(segment, true) : "";
      return key === "work_time" ? row + penaltyRow : row;
    })
    .join("");

  return `
  <tr>
    <td style="background-color:#0f172a;padding:10px 16px 10px 32px;">
      <span style="color:#08a7f5;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">RACE SPLIT BREAKDOWN</span>
      <span style="display:block;color:#8fa0ba;font-family:Arial,Helvetica,sans-serif;font-size:11px;margin-top:3px;">Compared against ${splitSafe(benchmarkLabel)}</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff;padding:0;border-bottom:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr style="background-color:#f1f5f9;border-bottom:2px solid #e2e8f0;">
          <th style="padding:7px 8px 7px 12px;text-align:left;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Segment</th>
          <th style="padding:7px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Your Time</th>
          <th style="padding:7px 8px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#08a7f5;">Target *</th>
          <th style="padding:7px 8px 7px 4px;text-align:right;font-family:'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">+/−</th>
        </tr>
        ${raceRows}
        ${aggregateRows}
        <tr>
          <td colspan="4" style="padding:6px 12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-style:italic;color:#94a3b8;">
            * Target times based on ${splitSafe(benchmarkLabel)} benchmark group. Positive (+) = slower than target; negative (−) = faster.
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderFooter() {
  return `
  <tr>
    <td style="background-color:#0d1422;padding:22px 32px;border-radius:0 0 8px 8px;text-align:center;">
      <p style="color:#8fa0ba;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.04em;margin:0 0 6px;">FORMA &nbsp;&#183;&nbsp; forma.fit &nbsp;&#183;&nbsp; Performance Analytics for Hybrid Athletes</p>
      <p style="color:#4a5568;font-family:Arial,Helvetica,sans-serif;font-size:10px;margin:0;">This analysis is for guidance only. Individual results vary.</p>
    </td>
  </tr>`;
}

function renderSection(section, analysisJson) {
  switch (section.sectionKey) {
    case "executive_summary":
      return renderExecutiveSummary(section);
    case "biggest_strength":
      return renderStrengthCard(section);
    case "biggest_limiter":
      return renderStationBreakdown(section);
    case "time_potential":
      return renderTimePotential(section);
    case "athlete_background":
      return renderAthleteBackground(section);
    case "recommended_focus_areas":
      return renderRecommendations(section);
    case "cta":
      return renderCta(section, analysisJson);
    case "race_snapshot":
      return "";
    case "race_split_breakdown":
      return renderSplitTable(section, analysisJson);
    case "muscle_group_profile":
      return renderMuscleGroupSection(section);
    default:
      return renderTextCard(section);
  }
}

export function buildEmailReport(personalReport = { sections: [] }, analysisJson = {}, athleteContext = {}) {
  const limiter = limiterName(analysisJson);
  const subject = limiter ? `Your HYROX bottleneck is ${limiter}` : "Your HYROX analysis is ready";
  const rawName = athleteContext.firstName ?? athleteContext.displayName ?? null;
  const firstName = rawName ? rawName.split(/[\s,]+/)[0] : "there";
  const greetingName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const greeting = `Hi ${greetingName},`;
  const sections = Array.isArray(personalReport.sections) ? personalReport.sections : [];
  const textSections = sections
    .map((section) => `${section.title}\n${contentText(section.content)}`)
    .join("\n\n");
  const textBody = enforceTone(`${greeting}\n\n${textSections}`);
  const sectionRows = sections.map((section) => renderSection(section, analysisJson)).join("");
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
          ${renderHero(analysisJson, greetingName)}
          ${renderMetricStrip(analysisJson, athleteContext)}
          ${sectionRows}
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
