import express from "express";
import { ZipArchive } from "archiver";
import { pool as defaultPool } from "../db.js";
import { buildHyroxRaceCardData } from "../hyrox/reports/raceCardDataMapper.js";
import { generateRaceCardPng } from "../hyrox/sharePack/raceCardScreenshotter.js";
import { submissionInput } from "../hyrox/hyroxController.js";
import { parseHyroxResultsHtml } from "../hyrox/ingestion/parseHyroxResultsHtml.js";
import { parseHyroxResultsText } from "../hyrox/ingestion/parseHyroxResultsText.js";
import { analyseSubmission } from "../hyrox/engine/hyroxAnalysisEngine.js";
import { normaliseSubmission } from "../hyrox/engine/segmentNormaliser.js";
import { generateInsights } from "../hyrox/insights/insightEngine.js";
import { assembleReport } from "../hyrox/reports/reportAssembler.js";
import { buildCarouselPage } from "../hyrox/reports/carouselPageBuilder.js";
import { lookupHyroxEventByKey } from "../hyrox/services/hyroxEventsService.js";
import { detectHyroxDivisionFromUrl } from "../hyrox/ingestion/detectHyroxDivision.js";

const RESULTS_URL_PREFIX = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 12_000;

const FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; Forma-HYROX-TestHarness/1.0)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9",
};

function isValidHyroxResultsUrl(value) {
  return typeof value === "string" && value.trim().startsWith(RESULTS_URL_PREFIX);
}

function parseRequestedUrls(body = {}) {
  if (Array.isArray(body.cases)) {
    return [...new Set(body.cases.map((entry) => String(entry?.url ?? "").trim()).filter(Boolean))];
  }

  const rawUrls = Array.isArray(body.urls)
    ? body.urls
    : typeof body.urls === "string"
      ? body.urls.split(/\r?\n/)
      : typeof body.url === "string"
        ? body.url.split(/\r?\n/)
        : [];

  return [...new Set(rawUrls.map((url) => String(url ?? "").trim()).filter(Boolean))];
}

function parseRequestedCases(body = {}) {
  if (Array.isArray(body.cases)) {
    const seen = new Set();
    return body.cases
      .map((entry) => ({
        url: String(entry?.url ?? "").trim(),
        targetTime: entry?.targetTime,
        label: String(entry?.label ?? "").trim(),
        expectedCommentary: String(entry?.expectedCommentary ?? "").trim(),
      }))
      .filter((entry) => {
        if (!entry.url || seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      });
  }

  return parseRequestedUrls(body).map((url) => ({
    url,
    targetTime: body.targetTime,
    label: String(body.label ?? "").trim(),
    expectedCommentary: String(body.expectedCommentary ?? "").trim(),
  }));
}

function validateUrlList(urls) {
  if (!urls.length || urls.some((url) => !isValidHyroxResultsUrl(url))) {
    return { ok: false, status: 400, body: { error: "invalid_url" } };
  }
  if (urls.length > 50) {
    return { ok: false, status: 400, body: { error: "too_many_urls", limit: 50 } };
  }
  return { ok: true };
}

export function parseTargetTimeSeconds(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);

  const value = String(raw).trim();
  if (/^\d+$/.test(value)) return Number(value);

  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "-";
  const value = Math.max(0, Math.round(seconds));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function markdownValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function flattenPrimitiveFields(value, prefix = "", out = []) {
  if (!value || typeof value !== "object") return out;

  for (const [key, fieldValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (fieldValue === null || fieldValue === undefined || fieldValue === "") continue;
    if (["string", "number", "boolean"].includes(typeof fieldValue)) {
      out.push([path, fieldValue]);
    } else if (Array.isArray(fieldValue)) {
      const primitiveValues = fieldValue.filter((item) => ["string", "number", "boolean"].includes(typeof item));
      if (primitiveValues.length) out.push([path, primitiveValues.join(", ")]);
    } else if (typeof fieldValue === "object") {
      flattenPrimitiveFields(fieldValue, path, out);
    }
  }
  return out;
}

export function slidesToText(slides = []) {
  if (!Array.isArray(slides) || slides.length === 0) return "_No carousel slides generated._";

  const preferred = new Set([
    "slide_id",
    "slideId",
    "headline",
    "title",
    "subtitle",
    "kicker",
    "hero_number",
    "heroNumber",
    "metric",
    "caption",
    "cta",
    "button",
  ]);

  return slides.map((slide, index) => {
    const rows = [`### Slide ${index + 1}`];
    const flattened = flattenPrimitiveFields(slide)
      .filter(([key]) => !/(?:image|url|link)/i.test(key));
    const ordered = [
      ...flattened.filter(([key]) => preferred.has(key)),
      ...flattened.filter(([key]) => !preferred.has(key)),
    ];
    for (const [key, value] of ordered) rows.push(`- ${key}: ${markdownValue(value)}`);
    return rows.join("\n");
  }).join("\n\n");
}

function carouselText(carouselReport = {}, calculatorMode = null) {
  const slides = carouselReport?.slides ?? [];
  const rows = [
    calculatorMode === "target" ? "Target-mode carousel text" : "Analyse-mode carousel text",
    "",
    slidesToText(slides),
  ];

  const flowSlide = slides.find((slide) => Array.isArray(slide?.stations));
  if (flowSlide) {
    rows.push("", "### Slide Station Rows", "");
    rows.push(`- comparison_basis: ${markdownValue(flowSlide.comparison_basis)}`);
    rows.push(`- legend_text: ${markdownValue(flowSlide.legend_text)}`);
    for (const station of flowSlide.stations) {
      rows.push(`- ${markdownValue(station.name)}: time ${markdownValue(station.time)}, target ${markdownValue(station.target_time ?? station.benchmark_time)}, delta ${markdownValue(station.delta)}, tone ${markdownValue(station.tone)}`);
    }
  }

  return rows.join("\n");
}

export function screen4Boxes(browserSummary = {}, calculatorMode = null) {
  const rows = [];

  const archetype = browserSummary.athleteArchetype?.label ?? null;
  const benchmark = browserSummary.overallPercentileLabel ?? (browserSummary.overallPercentile != null ? `Top ${100 - browserSummary.overallPercentile}%` : null);
  const benchmarkGroup = browserSummary.benchmarkGroupLabel ?? null;
  const strength = browserSummary.biggestStrength
    ? `${browserSummary.biggestStrength.label}${browserSummary.biggestStrength.percentile != null ? ` (${browserSummary.biggestStrength.percentile}th percentile)` : ""}`
    : null;
  const limiter = browserSummary.biggestLimiter
    ? `${browserSummary.biggestLimiter.label}${browserSummary.biggestLimiter.timeGapFormatted ? ` — ${browserSummary.biggestLimiter.timeGapFormatted}` : ""}`
    : null;
  const heroInsight = browserSummary.heroInsight?.title ?? null;
  const heroMetric = browserSummary.heroInsight?.heroMetric ?? null;
  const timePotential = browserSummary.timePotential?.headlineGainFormatted ?? null;
  const projectedTime = browserSummary.timePotential?.projectedTimeFormatted ?? null;
  const workRunBalance = browserSummary.workRunBalance?.profileTypeLabel ?? browserSummary.workRunBalance?.profileType ?? null;

  if (calculatorMode === "analyse") {
    rows.push(`| Athlete Archetype | ${markdownValue(archetype)} |`);
    rows.push(`| Benchmark Position | ${markdownValue(benchmark)}${benchmarkGroup ? ` — ${benchmarkGroup}` : ""} |`);
    rows.push(`| Run vs Station | ${markdownValue(workRunBalance)} |`);
    rows.push(`| Biggest Strength | ${markdownValue(strength)} |`);
  } else {
    rows.push(`| Athlete Archetype | ${markdownValue(archetype)} |`);
    rows.push(`| Overall Benchmark | ${markdownValue(benchmark)}${benchmarkGroup ? ` — ${benchmarkGroup}` : ""} |`);
    rows.push(`| Biggest Strength | ${markdownValue(strength)} |`);
    rows.push(`| Biggest Limiter | ${markdownValue(limiter)} |`);
    rows.push(`| Time Potential | ${markdownValue(timePotential)}${projectedTime ? ` → ${projectedTime}` : ""} |`);
  }

  if (heroInsight) rows.push(`| Hero Insight | ${markdownValue(heroInsight)}${heroMetric ? ` (${heroMetric})` : ""} |`);

  if (!rows.length) return "_No browser summary data available._";

  return `| Box | Value |\n|-----|-------|\n${rows.join("\n")}`;
}

function localTimestampSlug(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}

function nameSlug(name) {
  const slug = String(name || "hyrox-athlete")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "hyrox-athlete";
}

function titleCaseNamePart(value) {
  function formatToken(part) {
    if (/[a-z]/.test(part) && /[A-Z]/.test(part.slice(1))) return part;
    if (part === part.toUpperCase()) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatToken)
    .join(" ");
}

function displayNameFromSurnameFirstPart(rawPart) {
  const trimmed = String(rawPart ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(",")) {
    const [surname, given] = trimmed.split(",", 2).map((part) => part.trim());
    return [titleCaseNamePart(given), titleCaseNamePart(surname)].filter(Boolean).join(" ") || null;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return [titleCaseNamePart(parts.slice(1).join(" ")), titleCaseNamePart(parts[0])].filter(Boolean).join(" ");
  }
  return titleCaseNamePart(trimmed);
}

function displayAthleteName(parsed = {}) {
  const rawName = parsed.athleteName ?? parsed.name ?? "";
  const trimmed = String(rawName).trim();
  if (!trimmed) return "HYROX athlete";
  if (trimmed.includes(" & ")) {
    const names = trimmed
      .split(/\s+&\s+/)
      .map(displayNameFromSurnameFirstPart)
      .filter(Boolean);
    if (names.length > 0) return names.join(" & ");
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 4 && parsed.division && /doubles/i.test(String(parsed.division))) {
    return `${titleCaseNamePart(parts[1])} ${titleCaseNamePart(parts[0])} & ${titleCaseNamePart(parts[3])} ${titleCaseNamePart(parts[2])}`;
  }
  // HYROX official results use "SURNAME, FIRSTNAME" — convert to "Firstname Surname"
  if (trimmed.includes(",")) {
    const converted = displayNameFromSurnameFirstPart(trimmed);
    if (converted) return converted;
  }
  return titleCaseNamePart(trimmed);
}

function parsedConfidence(parsed) {
  if (!parsed || typeof parsed !== "object") return "low";
  return parsed.confidence ?? parsed.parseConfidence ?? parsed.dataQuality?.confidence ?? null;
}

function parsedIsLowConfidence(parsed) {
  if (!parsed) return true;
  const splitCount = Array.isArray(parsed.splits) ? parsed.splits.length : 0;
  const confidence = String(parsedConfidence(parsed) || "").toLowerCase();
  return splitCount === 0 || confidence === "low";
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`HYROX fetch failed with HTTP ${response.status}`);
      error.reason = `fetch_failed_${response.status}`;
      throw error;
    }
    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("HYROX fetch timed out");
      timeout.reason = "timeout";
      throw timeout;
    }
    if (!error.reason) error.reason = "fetch_failed";
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupEvent(pool, eventLookupKey) {
  if (!pool || !eventLookupKey) return null;
  try {
    return await lookupHyroxEventByKey(pool, eventLookupKey);
  } catch {
    return null;
  }
}

function sexFromUrl(url) {
  try {
    const raw = new URL(url).searchParams.get("search[sex]");
    if (raw === "M") return "M";
    if (raw === "W" || raw === "F") return "W";
  } catch {
    // ignore
  }
  return null;
}

export function normalizeSex(raw) {
  if (!raw) return null;
  const v = String(raw).toLowerCase().trim();
  if (v === "m" || v === "male") return "male";
  if (v === "w" || v === "f" || v === "female") return "female";
  return null;
}

async function fetchAndParseHyroxUrl(url, pool) {
  const html = await fetchHtml(url);
  let parsed = parseHyroxResultsHtml(html);
  if (parsedIsLowConfidence(parsed)) {
    parsed = parseHyroxResultsText(html);
  }
  if (parsedIsLowConfidence(parsed)) {
    const error = new Error("No usable HYROX splits found");
    error.reason = "no_splits_found";
    throw error;
  }

  const parsedUrl = new URL(url);
  const eventLookupKey = parsedUrl.searchParams.get("event_main_group") ?? parsed.raceName ?? null;
  const event = await lookupEvent(pool, eventLookupKey);

  // Sex is not extracted by the HTML/text parsers but is often encoded in the HYROX results URL.
  // Normalize to "male"/"female" so benchmark group key lookups match DB values.
  const urlSex = normalizeSex(parsed.sex ?? parsed.gender ?? sexFromUrl(url));

  return {
    parsed: { ...parsed, sex: urlSex },
    event,
    eventLookupKey,
    sourceUrl: url,
    divisionDetection: detectHyroxDivisionFromUrl(url),
  };
}

function buildBody({ modeName, calculatorMode, targetFinishTimeSeconds, parsed, event, sharedContext = {} }) {
  const athleteDisplayName = displayAthleteName(parsed);
  const sharedAthlete = {
    name: parsed.athleteName ?? parsed.name ?? null,
    displayName: athleteDisplayName,
    sex: parsed.sex ?? parsed.gender ?? null,
    ageGroup: parsed.ageGroup ?? null,
    ageOnRaceDay: parsed.ageOnRaceDay ?? null,
    division: parsed.division ?? null,
  };
  const sharedRace = {
    raceName: event?.eventName ?? parsed.raceName ?? null,
    eventDate: isoDate(event?.startDate) ?? isoDate(parsed.eventDate),
    finishTimeSeconds: parsed.finishTimeSeconds ?? null,
    division: parsed.division ?? null,
  };
  const athleteContext = {
    ...sharedContext,
    calculatorMode,
    displayName: sharedAthlete.displayName,
    division: sharedAthlete.division,
    ...(targetFinishTimeSeconds != null ? { targetFinishTimeSeconds, targetTimeSeconds: targetFinishTimeSeconds } : {}),
    harnessModeName: modeName,
  };

  return {
    calculatorMode,
    athlete: sharedAthlete,
    race: sharedRace,
    splits: parsed.splits ?? [],
    penalties: parsed.penalties ?? [],
    raceReplay: parsed.raceReplay ?? [],
    athleteContext,
  };
}

function runMode(mode, parsed, event, sharedContext) {
  const body = buildBody({ ...mode, parsed, event, sharedContext });
  const input = submissionInput(body);
  const normalised = normaliseSubmission(input);
  const analysisJson = analyseSubmission(input);
  analysisJson.race = {
    ...(analysisJson.race ?? {}),
    ...input.race,
    targetTimeSeconds: mode.targetFinishTimeSeconds ?? input.race?.targetTimeSeconds ?? null,
  };
  analysisJson.athlete = { ...(analysisJson.athlete ?? {}), ...input.athlete };
  const raceResult = {
    ...input.race,
    finishTimeSeconds: input.race?.finishTimeSeconds ?? parsed.finishTimeSeconds ?? null,
    targetFinishTimeSeconds: mode.targetFinishTimeSeconds ?? null,
    targetTimeSeconds: mode.targetFinishTimeSeconds ?? input.race?.targetTimeSeconds ?? null,
    splits: input.splits,
    penalties: input.penalties,
    raceReplay: input.raceReplay,
  };
  const athleteContext = {
    ...input.athleteContext,
    calculatorMode: mode.calculatorMode,
    targetFinishTimeSeconds: mode.targetFinishTimeSeconds ?? undefined,
    targetTimeSeconds: mode.targetFinishTimeSeconds ?? undefined,
    targetLabel: mode.targetFinishTimeSeconds ? formatSeconds(mode.targetFinishTimeSeconds) : undefined,
  };
  const insights = generateInsights(analysisJson, athleteContext);
  const reportRequest = { raceResult, analysisJson, insights, athleteContext, calculatorMode: mode.calculatorMode };

  return {
    mode,
    input,
    normalised,
    analysisJson,
    insights,
    emailReport: assembleReport({ ...reportRequest, outputType: "email_report" }),
    webReport: assembleReport({ ...reportRequest, outputType: "web_report" }),
    carouselReport: assembleReport({ ...reportRequest, outputType: "carousel_a" }),
  };
}

function maybeJson(value) {
  if (value === undefined || value === null) return "-";
  return JSON.stringify(value, null, 2);
}

function modeMarkdown(entry) {
  const mode = entry.mode;
  const rows = [
    `## ${mode.modeName}`,
    "",
    `- Calculator mode: ${mode.calculatorMode}`,
    `- Target finish: ${mode.targetFinishTimeSeconds ? formatSeconds(mode.targetFinishTimeSeconds) : "none"}`,
  ];

  if (entry.error) {
    rows.push("", `### Failure`, "", `- ${entry.error.message ?? "Mode failed"}`);
    return rows.join("\n");
  }

  const result = entry.result;
  const analysis = result.analysisJson ?? {};
  const browserSummary = result.webReport?.browserSummary ?? {};
  const limiter = firstDefined(
    analysis.limiter?.segmentName,
    analysis.limiter?.segmentKey,
    browserSummary.primaryLimiter?.label,
    browserSummary.primaryLimiter?.segmentName,
  );
  const strength = firstDefined(
    analysis.strength?.segmentName,
    analysis.strength?.segmentKey,
    browserSummary.primaryStrength?.label,
    browserSummary.primaryStrength?.segmentName,
  );
  const benchmarkGroup = firstDefined(
    analysis.benchmarkContext?.primaryBenchmarkGroup?.label,
    analysis.benchmarkContext?.primaryBenchmarkGroup?.key,
    result.emailReport?.benchmarkContext?.primaryGroup,
  );

  rows.push(
    "",
    "### Structured Values",
    "",
    `- Analysis scope: ${markdownValue(analysis.analysisScope)}`,
    `- Confidence: ${markdownValue(result.emailReport?.confidence ?? analysis.dataQuality?.confidence)}`,
    `- Benchmark group: ${markdownValue(benchmarkGroup)}`,
    `- Finish: ${formatSeconds(result.input?.race?.finishTimeSeconds)}`,
    `- Target gap: ${markdownValue(analysis.target?.gapSeconds !== undefined ? formatSeconds(Math.abs(analysis.target.gapSeconds)) : null)}`,
    `- Limiter: ${markdownValue(limiter)}`,
    `- Strength: ${markdownValue(strength)}`,
    `- Insight count: ${Array.isArray(result.insights) ? result.insights.length : 0}`,
    "",
    "### Browser Summary",
    "",
    "```json",
    maybeJson(browserSummary),
    "```",
    "",
    "### Screen 4 Boxes",
    "",
    screen4Boxes(browserSummary, mode.calculatorMode),
    "",
    "### Email Subject",
    "",
    markdownValue(result.emailReport?.emailSubject),
    "",
    "### Email HTML",
    "",
    "```html",
    result.emailReport?.emailHtml ?? "",
    "```",
    "",
    "### Carousel Text",
    "",
    carouselText(result.carouselReport, mode.calculatorMode),
  );

  return rows.join("\n");
}

function comparisonNotes(modeEntries, parsed) {
  const successful = modeEntries.filter((entry) => entry.result);
  const email = (index) => modeEntries[index]?.result?.emailReport?.emailHtml ?? "";
  const subject = (index) => modeEntries[index]?.result?.emailReport?.emailSubject ?? "";
  const slides = (entry) => entry.result?.carouselReport?.slides ?? [];
  const browserSummary = (entry) => entry.result?.webReport?.browserSummary ?? {};

  const notes = {
    allModesCompleted: successful.length === 2,
    targetModeUsesTargetLanguage: /target/i.test(`${email(0)} ${subject(0)}`),
    analyseModeUsesBenchmarkLanguage: /benchmark|percentile|field/i.test(`${email(1)} ${subject(1)}`),
    targetAndAnalyseEmailsDiffer: Boolean(email(0)) && Boolean(email(1)) && email(0) !== email(1),
    carouselTextGeneratedForAllModes: modeEntries.every((entry) => slides(entry).length > 0),
    screen4BoxesPresentForAllModes: modeEntries.every((entry) => !/^_No/.test(screen4Boxes(browserSummary(entry), entry.mode.calculatorMode))),
    penaltiesSeparatedFromRunningIfPresent: (parsed.penalties ?? []).length === 0 || /penalt/i.test(`${email(0)} ${email(1)}`),
    noPublicCarouselImageLinksExpected: true,
    noDbWritesOrEmailsExpected: true,
  };

  return [
    "## Comparison Notes",
    "",
    ...Object.entries(notes).map(([key, value]) => `- ${key}: ${value ? "true" : "false"}`),
    "",
    qaFlagsMarkdown(modeEntries),
  ].join("\n");
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function targetTimeZeroIssue(emailHtml) {
  const text = stripHtml(emailHtml).toUpperCase();
  return /TARGET TIME\s+(?:-|—|–)?\s*0:00\b/.test(text);
}

function modeQaFlags(entry) {
  const mode = entry.mode ?? {};
  const result = entry.result;
  if (!result) return [{ name: "mode_completed", pass: false, detail: entry.error?.message ?? "mode failed" }];

  const emailHtml = result.emailReport?.emailHtml ?? "";
  const emailText = stripHtml(emailHtml);
  const carouselSlides = result.carouselReport?.slides ?? [];
  const flowSlide = carouselSlides.find((slide) => Array.isArray(slide?.stations));
  const flags = [
    { name: "mode_completed", pass: true, detail: "report generation completed" },
    {
      name: "calculator_mode_preserved",
      pass: result.input?.calculatorMode === mode.calculatorMode,
      detail: `expected ${mode.calculatorMode}`,
    },
    {
      name: "screen4_boxes_captured",
      pass: !/^_No browser summary/.test(screen4Boxes(result.webReport?.browserSummary ?? {}, mode.calculatorMode)),
      detail: "browserSummary-derived boxes present",
    },
    {
      name: "carousel_text_mode_aware",
      pass: mode.calculatorMode === "target"
        ? flowSlide?.comparison_basis === "TARGET"
        : flowSlide?.comparison_basis !== "TARGET",
      detail: `comparison_basis ${markdownValue(flowSlide?.comparison_basis)}`,
    },
  ];

  if (mode.calculatorMode === "target") {
    const expectedTarget = mode.targetFinishTimeSeconds ? formatSeconds(mode.targetFinishTimeSeconds) : null;
    flags.push(
      {
        name: "target_email_has_selected_target_time",
        pass: Boolean(expectedTarget && emailText.includes(expectedTarget)),
        detail: `expected ${markdownValue(expectedTarget)}`,
      },
      {
        name: "target_email_does_not_show_zero_target_time",
        pass: !targetTimeZeroIssue(emailHtml),
        detail: "fails on TARGET TIME 0:00",
      },
      {
        name: "target_has_goal_benchmark_group",
        pass: result.analysisJson?.benchmarkContext?.goalBenchmarkGroup != null,
        detail: "goalBenchmarkGroup null → target gap renders as '-' in email",
      },
    );
  }

  return flags;
}

function qaFlagsMarkdown(modeEntries) {
  const rows = ["## QA Flags", ""];
  for (const entry of modeEntries) {
    rows.push(`### ${entry.mode?.modeName ?? "Mode"}`, "");
    for (const flag of modeQaFlags(entry)) {
      rows.push(`- ${flag.pass ? "PASS" : "FAIL"} ${flag.name}: ${flag.detail}`);
    }
    rows.push("");
  }
  return rows.join("\n");
}

function buildMarkdown({ sourceUrl, eventLookupKey, parsed, event, targetFinishTimeSeconds, modeEntries, divisionDetection, label = "", expectedCommentary = "" }) {
  const athleteDisplayName = displayAthleteName(parsed);
  const metadata = [
    "# HYROX QA Test Harness",
    "",
    "## Metadata",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    ...(label ? [`- Label: ${markdownValue(label)}`] : []),
    `- Source URL: ${sourceUrl}`,
    `- Event lookup key: ${markdownValue(eventLookupKey)}`,
    `- Event name: ${markdownValue(event?.eventName ?? parsed.raceName)}`,
    `- Event date: ${markdownValue(isoDate(event?.startDate) ?? isoDate(parsed.eventDate))}`,
    `- Athlete: ${markdownValue(athleteDisplayName)}`,
    `- Division: ${markdownValue(parsed.division)}`,
    `- Detected race format: ${markdownValue(divisionDetection?.raceFormat)}`,
    `- Detected division label: ${markdownValue(divisionDetection?.divisionLabel)}`,
    `- Division detection source: ${markdownValue(divisionDetection?.source)}`,
    `- Finish time: ${formatSeconds(parsed.finishTimeSeconds)}`,
    `- Target time: ${targetFinishTimeSeconds ? formatSeconds(targetFinishTimeSeconds) : "none"}`,
    `- Split count: ${Array.isArray(parsed.splits) ? parsed.splits.length : 0}`,
    `- Penalty count: ${Array.isArray(parsed.penalties) ? parsed.penalties.length : 0}`,
    `- Race replay events: ${Array.isArray(parsed.raceReplay) ? parsed.raceReplay.length : 0}`,
    "",
    "## Shared Inputs",
    "",
    "```json",
    JSON.stringify({
      athlete: {
        displayName: athleteDisplayName,
        division: parsed.division ?? null,
      },
      race: {
        raceName: event?.eventName ?? parsed.raceName ?? null,
        eventDate: isoDate(event?.startDate) ?? isoDate(parsed.eventDate),
        finishTimeSeconds: parsed.finishTimeSeconds ?? null,
      },
      splits: parsed.splits ?? [],
      penalties: parsed.penalties ?? [],
      raceReplay: parsed.raceReplay ?? [],
    }, null, 2),
    "```",
    "",
  ].join("\n");

  const intentSection = expectedCommentary
    ? [`## Test Case Intent\n\n${expectedCommentary}`]
    : [];

  return [
    metadata,
    ...intentSection,
    ...modeEntries.map(modeMarkdown),
    comparisonNotes(modeEntries, parsed),
    "",
  ].join("\n\n");
}

function emailArtifactMarkdown({ sourceUrl, parsed, targetFinishTimeSeconds, modeEntries }) {
  const athleteDisplayName = displayAthleteName(parsed);
  const rows = [
    "# HYROX Email Artifact",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Source URL: ${sourceUrl}`,
    `- Athlete: ${markdownValue(athleteDisplayName)}`,
    `- Finish time: ${formatSeconds(parsed.finishTimeSeconds)}`,
    `- Target time: ${targetFinishTimeSeconds ? formatSeconds(targetFinishTimeSeconds) : "none"}`,
    "",
  ];

  for (const entry of modeEntries) {
    rows.push(`## ${entry.mode.modeName}`, "");
    if (entry.error) {
      rows.push("### Failure", "", `- ${entry.error.message ?? "Mode failed"}`, "");
      continue;
    }
    rows.push(
      `- Calculator mode: ${entry.mode.calculatorMode}`,
      `- Target finish: ${entry.mode.targetFinishTimeSeconds ? formatSeconds(entry.mode.targetFinishTimeSeconds) : "none"}`,
      "",
      "### Subject",
      "",
      markdownValue(entry.result.emailReport?.emailSubject),
      "",
      "### HTML",
      "",
      "```html",
      entry.result.emailReport?.emailHtml ?? "",
      "```",
      "",
    );
  }

  return rows.join("\n");
}

function instagramArtifactMarkdown({ sourceUrl, parsed, targetFinishTimeSeconds, modeEntries }) {
  const athleteDisplayName = displayAthleteName(parsed);
  const rows = [
    "# HYROX Instagram Pack",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Source URL: ${sourceUrl}`,
    `- Athlete: ${markdownValue(athleteDisplayName)}`,
    `- Finish time: ${formatSeconds(parsed.finishTimeSeconds)}`,
    `- Target time: ${targetFinishTimeSeconds ? formatSeconds(targetFinishTimeSeconds) : "none"}`,
    "",
  ];

  for (const entry of modeEntries) {
    rows.push(`## ${entry.mode.modeName}`, "");
    if (entry.error) {
      rows.push("### Failure", "", `- ${entry.error.message ?? "Mode failed"}`, "");
      continue;
    }
    rows.push(
      `- Calculator mode: ${entry.mode.calculatorMode}`,
      `- Target finish: ${entry.mode.targetFinishTimeSeconds ? formatSeconds(entry.mode.targetFinishTimeSeconds) : "none"}`,
      "",
      "### Carousel Text",
      "",
      carouselText(entry.result.carouselReport, entry.mode.calculatorMode),
      "",
    );
  }

  return rows.join("\n");
}

function artifactMarkdown(artifact, result) {
  if (artifact === "email") {
    return emailArtifactMarkdown({
      sourceUrl: result.sourceUrl,
      parsed: result.parsed,
      targetFinishTimeSeconds: result.targetFinishTimeSeconds,
      modeEntries: result.modeEntries,
    });
  }

  if (artifact === "instagram") {
    return instagramArtifactMarkdown({
      sourceUrl: result.sourceUrl,
      parsed: result.parsed,
      targetFinishTimeSeconds: result.targetFinishTimeSeconds,
      modeEntries: result.modeEntries,
    });
  }

  return result.markdown;
}

function responseFilename(parsed) {
  return `hyrox-harness-${nameSlug(displayAthleteName(parsed))}-${localTimestampSlug()}.md`;
}

function packResponseFilename(count) {
  return `hyrox-harness-pack-${count}-${localTimestampSlug()}.md`;
}

function artifactResponseFilename(artifact, parsed) {
  if (artifact === "email_html") return `hyrox-email-html-${nameSlug(displayAthleteName(parsed))}-${localTimestampSlug()}.zip`;
  return `hyrox-${artifact}-${nameSlug(displayAthleteName(parsed))}-${localTimestampSlug()}.md`;
}

function artifactPackResponseFilename(artifact, count) {
  if (artifact === "email_html") return `hyrox-email-html-pack-${count}-${localTimestampSlug()}.zip`;
  return `hyrox-${artifact}-pack-${count}-${localTimestampSlug()}.md`;
}

function caseHeading(index, total, url, result, label = "", expectedCommentary = "") {
  const athlete = result?.parsed ? displayAthleteName(result.parsed) : null;
  const autoLabel = athlete ? `${athlete} — ${url}` : url;
  const displayLabel = label || autoLabel;
  const targetFinishTimeSeconds = result?.targetFinishTimeSeconds ?? null;
  const rows = [
    `# Test Case ${index + 1} of ${total}${label ? `: ${label}` : ""}`,
    "",
    `- URL: ${url}`,
    `- Label: ${markdownValue(displayLabel)}`,
    `- Target time: ${targetFinishTimeSeconds ? formatSeconds(targetFinishTimeSeconds) : "none"}`,
  ];
  if (expectedCommentary) {
    rows.push("", "**Expected commentary:**", "");
    for (const line of expectedCommentary.split("\n")) {
      if (line.trim()) rows.push(`> ${line}`);
    }
  }
  rows.push("");
  return rows.join("\n");
}

async function runHarnessCase({ url, pool, targetFinishTimeSeconds, sharedContext, label = "", expectedCommentary = "" }) {
  const importResult = await fetchAndParseHyroxUrl(url, pool);
  const modes = [
    { modeName: "Mode 1: Target With Target Time", calculatorMode: "target", targetFinishTimeSeconds },
    { modeName: "Mode 2: Analyse Without Target Time", calculatorMode: "analyse", targetFinishTimeSeconds: null },
  ];

  const modeEntries = modes.map((mode) => {
    try {
      return { mode, result: runMode(mode, importResult.parsed, importResult.event, sharedContext) };
    } catch (error) {
      return { mode, error };
    }
  });

  if (modeEntries.every((entry) => entry.error)) {
    const error = new Error("All harness modes failed");
    error.reason = "all_modes_failed";
    throw error;
  }

  return {
    ...importResult,
    targetFinishTimeSeconds,
    label,
    expectedCommentary,
    modeEntries,
    markdown: buildMarkdown({
      sourceUrl: importResult.sourceUrl,
      eventLookupKey: importResult.eventLookupKey,
      parsed: importResult.parsed,
      event: importResult.event,
      targetFinishTimeSeconds,
      modeEntries,
      divisionDetection: importResult.divisionDetection,
      label,
      expectedCommentary,
    }),
  };
}

function metadataFromImportResult(importResult) {
  const parsed = importResult.parsed ?? {};
  const event = importResult.event ?? null;
  return {
    url: importResult.sourceUrl,
    athleteName: displayAthleteName(parsed),
    rawAthleteName: parsed.athleteName ?? parsed.name ?? null,
    division: parsed.division ?? null,
    sex: parsed.sex ?? parsed.gender ?? null,
    ageGroup: parsed.ageGroup ?? null,
    raceName: event?.eventName ?? parsed.raceName ?? null,
    eventDate: isoDate(event?.startDate) ?? isoDate(parsed.eventDate),
    finishTimeSeconds: parsed.finishTimeSeconds ?? null,
    finishTimeFormatted: formatSeconds(parsed.finishTimeSeconds),
    splitCount: Array.isArray(parsed.splits) ? parsed.splits.length : 0,
    penaltyCount: Array.isArray(parsed.penalties) ? parsed.penalties.length : 0,
    confidence: parsedConfidence(parsed) ?? null,
    warnings: parsed.warnings ?? [],
    divisionDetection: importResult.divisionDetection ?? null,
  };
}

function buildPackMarkdown({ entries }) {
  const successCount = entries.filter((entry) => entry.result).length;
  const failureCount = entries.length - successCount;
  const rows = [
    "# HYROX QA Test Pack",
    "",
    "## Pack Metadata",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- URL count: ${entries.length}`,
    `- Successful cases: ${successCount}`,
    `- Failed cases: ${failureCount}`,
    `- Target times: per case`,
    "",
    "## Case Index",
    "",
    ...entries.map((entry, index) => {
      const status = entry.result ? "ok" : `failed: ${entry.reason ?? "unknown"}`;
      const target = entry.targetFinishTimeSeconds ? formatSeconds(entry.targetFinishTimeSeconds) : "invalid target";
      const labelPrefix = entry.label ? `[${entry.label}] ` : "";
      return `- ${index + 1}. ${labelPrefix}${entry.url} - target ${target} - ${status}`;
    }),
    "",
  ];

  for (const [index, entry] of entries.entries()) {
    rows.push("---", "");
    if (entry.result) {
      rows.push(caseHeading(index, entries.length, entry.url, entry.result, entry.label, entry.expectedCommentary), entry.result.markdown);
    } else {
      rows.push(
        `# Test Case ${index + 1} of ${entries.length}${entry.label ? `: ${entry.label}` : ""}`,
        "",
        "## Import Failure",
        "",
        `- URL: ${entry.url}`,
        `- Target time: ${entry.targetFinishTimeSeconds ? formatSeconds(entry.targetFinishTimeSeconds) : "invalid target"}`,
        `- Reason: ${markdownValue(entry.reason)}`,
        "",
      );
    }
  }

  return rows.join("\n");
}

function buildArtifactPackMarkdown({ artifact, entries }) {
  const successCount = entries.filter((entry) => entry.result).length;
  const failureCount = entries.length - successCount;
  const title = artifact === "email" ? "HYROX Email Pack" : "HYROX Instagram Pack";
  const rows = [
    `# ${title}`,
    "",
    "## Pack Metadata",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- URL count: ${entries.length}`,
    `- Successful cases: ${successCount}`,
    `- Failed cases: ${failureCount}`,
    `- Target times: per case`,
    "",
    "## Case Index",
    "",
    ...entries.map((entry, index) => {
      const status = entry.result ? "ok" : `failed: ${entry.reason ?? "unknown"}`;
      const target = entry.targetFinishTimeSeconds ? formatSeconds(entry.targetFinishTimeSeconds) : "invalid target";
      return `- ${index + 1}. ${entry.url} - target ${target} - ${status}`;
    }),
    "",
  ];

  for (const [index, entry] of entries.entries()) {
    rows.push("---", "");
    if (entry.result) {
      rows.push(caseHeading(index, entries.length, entry.url, entry.result), artifactMarkdown(artifact, entry.result));
    } else {
      rows.push(
        `# Test Case ${index + 1} of ${entries.length}`,
        "",
        "## Import Failure",
        "",
        `- URL: ${entry.url}`,
        `- Target time: ${entry.targetFinishTimeSeconds ? formatSeconds(entry.targetFinishTimeSeconds) : "invalid target"}`,
        `- Reason: ${markdownValue(entry.reason)}`,
        "",
      );
    }
  }

  return rows.join("\n");
}

function emailHtmlEntriesFromHarnessEntries(entries = []) {
  const files = [];
  for (const [caseIndex, entry] of entries.entries()) {
    if (!entry.result) continue;
    const athlete = entry.result.parsed ? displayAthleteName(entry.result.parsed) : `case-${caseIndex + 1}`;
    for (const [modeIndex, modeEntry] of entry.result.modeEntries.entries()) {
      if (modeEntry.error) continue;
      const subject = modeEntry.result?.emailReport?.emailSubject ?? "";
      const html = modeEntry.result?.emailReport?.emailHtml || `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject || "No email HTML generated")}</title></head>
<body>
  <h1>No email HTML generated</h1>
  <p>Mode: ${escapeHtml(modeEntry.mode?.modeName ?? `Mode ${modeIndex + 1}`)}</p>
  <p>Subject: ${escapeHtml(subject)}</p>
  <p>This harness mode completed, but the email renderer did not return HTML.</p>
</body>
</html>`;
      const modeSlug = modeEntry.mode?.calculatorMode ?? `mode-${modeIndex + 1}`;
      files.push({
        name: `${String(caseIndex + 1).padStart(2, "0")}-${nameSlug(athlete)}-${modeSlug}.html`,
        html,
      });
    }
  }
  return files;
}

async function sendEmailHtmlZip(res, { filename, entries }) {
  const files = emailHtmlEntriesFromHarnessEntries(entries);
  if (!files.length) {
    return res.status(422).json({ error: "no_email_html" });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(res);
  for (const file of files) {
    archive.append(file.html, { name: file.name });
  }
  await new Promise((resolve, reject) => {
    archive.on("error", reject);
    res.on("close", resolve);
    archive.finalize().catch(reject);
  });
}

function previewMode(entry) {
  if (entry.error) {
    return {
      ok: false,
      modeName: entry.mode?.modeName ?? "Mode",
      calculatorMode: entry.mode?.calculatorMode ?? null,
      targetFinishTimeFormatted: entry.mode?.targetFinishTimeSeconds ? formatSeconds(entry.mode.targetFinishTimeSeconds) : null,
      error: entry.error.message ?? "Mode failed",
    };
  }

  return {
    ok: true,
    modeName: entry.mode.modeName,
    calculatorMode: entry.mode.calculatorMode,
    targetFinishTimeFormatted: entry.mode.targetFinishTimeSeconds ? formatSeconds(entry.mode.targetFinishTimeSeconds) : null,
    emailSubject: entry.result.emailReport?.emailSubject ?? "",
    emailHtml: entry.result.emailReport?.emailHtml ?? "",
    carouselText: carouselText(entry.result.carouselReport, entry.mode.calculatorMode),
    carouselSlides: entry.result.carouselReport?.slides ?? [],
    carouselHtml: entry.result.carouselReport?.carousel ? buildCarouselPage(entry.result.carouselReport.carousel) : "",
    qaFlags: modeQaFlags(entry),
  };
}

function previewCase(entry) {
  if (!entry.result) {
    return {
      ok: false,
      url: entry.url,
      targetTimeFormatted: entry.targetFinishTimeSeconds ? formatSeconds(entry.targetFinishTimeSeconds) : null,
      reason: entry.reason ?? "parse_failed",
      modes: [],
    };
  }

  const parsed = entry.result.parsed ?? {};
  return {
    ok: true,
    url: entry.url,
    athleteName: displayAthleteName(parsed),
    finishTimeFormatted: formatSeconds(parsed.finishTimeSeconds),
    targetTimeFormatted: entry.result.targetFinishTimeSeconds ? formatSeconds(entry.result.targetFinishTimeSeconds) : null,
    modes: entry.result.modeEntries.map(previewMode),
  };
}

function previewPayload({ entries }) {
  return {
    success: entries.some((entry) => entry.result),
    generatedAt: new Date().toISOString(),
    cases: entries.map(previewCase),
  };
}

async function handleAdminRaceCard(req, res, pool, asAttachment) {
  const { submissionId } = req.params;
  let row;
  try {
    const result = await pool.query(
      `SELECT a.analysis_json, s.display_name, s.division, s.athlete_context_json, s.performance_context_json
       FROM hyrox_analyses a
       LEFT JOIN hyrox_submissions s ON s.id = a.submission_id
       WHERE a.submission_id = $1 LIMIT 1`,
      [submissionId],
    );
    row = result.rows[0];
  } catch (err) {
    return res.status(500).json({ error: "db_error", message: err?.message });
  }

  if (!row || !row.analysis_json) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const athleteContext = Object.assign(
      {},
      row.athlete_context_json && typeof row.athlete_context_json === "object" ? row.athlete_context_json : {},
      row.performance_context_json && typeof row.performance_context_json === "object" ? row.performance_context_json : {},
      row.display_name ? { displayName: row.display_name } : {},
      row.division ? { division: row.division } : {},
    );
    const raceCardData = buildHyroxRaceCardData(row.analysis_json, athleteContext);
    const pngBuffer = await generateRaceCardPng(raceCardData);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    if (asAttachment) {
      res.set("Content-Disposition", 'attachment; filename="race-card.png"');
    }
    return res.send(pngBuffer);
  } catch (err) {
    return res.status(500).json({ error: "race_card_generation_failed", message: err?.message });
  }
}

export function createAdminHyroxTestHarnessRouter(pool = defaultPool) {
  const router = express.Router();

  router.post("/hyrox/test-harness/metadata", async (req, res) => {
    try {
      const urls = parseRequestedUrls(req.body);
      const validation = validateUrlList(urls);
      if (!validation.ok) return res.status(validation.status).json(validation.body);

      const cases = [];
      for (const url of urls) {
        try {
          const importResult = await fetchAndParseHyroxUrl(url, pool);
          cases.push({ ok: true, ...metadataFromImportResult(importResult) });
        } catch (error) {
          cases.push({ ok: false, url, reason: error.reason ?? "parse_failed" });
        }
      }

      return res.status(200).json({
        success: cases.some((entry) => entry.ok),
        count: cases.length,
        cases,
      });
    } catch (error) {
      return res.status(500).json({ error: "test_harness_metadata_failed", message: error.message });
    }
  });

  router.post("/hyrox/test-harness", async (req, res) => {
    try {
      const cases = parseRequestedCases(req.body);
      const urls = cases.map((entry) => entry.url);
      const isPack = cases.length > 1;
	      const artifact = ["email", "instagram", "email_html"].includes(req.body?.artifact) ? req.body.artifact : "qa";

      const validation = validateUrlList(urls);
      if (!validation.ok) return res.status(validation.status).json(validation.body);
      for (const entry of cases) {
        entry.targetFinishTimeSeconds = parseTargetTimeSeconds(entry.targetTime);
      }
      const invalidCases = cases
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !Number.isFinite(entry.targetFinishTimeSeconds) || entry.targetFinishTimeSeconds <= 0 || entry.targetFinishTimeSeconds > 10_800);
      if (invalidCases.length) {
        const detail = invalidCases
          .map(({ entry, index }) => `case ${index + 1} — "${String(entry.targetTime ?? "").trim() || "(empty)"}"`)
          .join(", ");
        return res.status(400).json({ error: "invalid_target_time", reason: detail });
      }

      const sharedContext = {
        weeklyStrengthSessions: req.body?.weeklyStrengthSessions ?? undefined,
        weeklyRunningVolume: req.body?.weeklyRunningVolume ?? undefined,
        primaryBackground: req.body?.primaryBackground ?? undefined,
        additionalContext: req.body?.additionalContext ?? undefined,
      };

      if (!isPack) {
        try {
          const result = await runHarnessCase({
            url: cases[0].url,
            pool,
            targetFinishTimeSeconds: cases[0].targetFinishTimeSeconds,
            sharedContext,
            label: cases[0].label,
            expectedCommentary: cases[0].expectedCommentary,
          });
	          if (req.body?.preview === true) {
	            return res.status(200).json(previewPayload({
	              entries: [{ url: cases[0].url, targetFinishTimeSeconds: cases[0].targetFinishTimeSeconds, result }],
	            }));
	          }
	          if (artifact === "email_html") {
	            return sendEmailHtmlZip(res, {
	              filename: artifactResponseFilename(artifact, result.parsed),
	              entries: [{ url: cases[0].url, targetFinishTimeSeconds: cases[0].targetFinishTimeSeconds, result }],
	            });
	          }
	          res.setHeader("Content-Type", "text/markdown; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${artifact === "qa" ? responseFilename(result.parsed) : artifactResponseFilename(artifact, result.parsed)}"`);
          return res.status(200).send(artifactMarkdown(artifact, result));
        } catch (error) {
          if (error.reason === "all_modes_failed") {
            return res.status(500).json({ error: "all_modes_failed" });
          }
          return res.status(422).json({ error: "import_failed", reason: error.reason ?? "parse_failed" });
        }
      }

      const entries = [];
      for (const testCase of cases) {
        try {
          const result = await runHarnessCase({
            url: testCase.url,
            pool,
            targetFinishTimeSeconds: testCase.targetFinishTimeSeconds,
            sharedContext,
            label: testCase.label,
            expectedCommentary: testCase.expectedCommentary,
          });
          entries.push({ url: testCase.url, targetFinishTimeSeconds: testCase.targetFinishTimeSeconds, label: testCase.label, expectedCommentary: testCase.expectedCommentary, result });
        } catch (error) {
          entries.push({ url: testCase.url, targetFinishTimeSeconds: testCase.targetFinishTimeSeconds, label: testCase.label, expectedCommentary: testCase.expectedCommentary, reason: error.reason ?? "parse_failed" });
        }
      }

	      if (req.body?.preview === true) {
	        return res.status(200).json(previewPayload({ entries }));
	      }
	      if (artifact === "email_html") {
	        return sendEmailHtmlZip(res, {
	          filename: artifactPackResponseFilename(artifact, cases.length),
	          entries,
	        });
	      }

	      const markdown = artifact === "qa" ? buildPackMarkdown({ entries }) : buildArtifactPackMarkdown({ artifact, entries });
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${artifact === "qa" ? packResponseFilename(cases.length) : artifactPackResponseFilename(artifact, cases.length)}"`);
      return res.status(200).send(markdown);
    } catch (error) {
      return res.status(500).json({ error: "test_harness_failed", message: error.message });
    }
  });

  function suggestLabelAndCommentary(importResult, modeEntry) {
    if (modeEntry.error) {
      const division = importResult.parsed?.division ?? null;
      return {
        label: `Analysis failed${division ? ` — ${division}` : ""}`,
        expectedCommentary: `Analysis failed: ${modeEntry.error.message ?? "unknown error"}`,
      };
    }

    const result = modeEntry.result;
    const analysis = result.analysisJson ?? {};
    const browserSummary = result.webReport?.browserSummary ?? {};
    const parsed = importResult.parsed ?? {};

    const division = parsed.division ?? null;
    const analysisScope = analysis.analysisScope ?? "full";
    const penaltyCount = Array.isArray(parsed.penalties) ? parsed.penalties.length : 0;

    const limiter = firstDefined(
      analysis.limiter?.segmentName,
      analysis.limiter?.segmentKey,
      browserSummary.biggestLimiter?.label,
    );
    const strength = firstDefined(
      analysis.strength?.segmentName,
      analysis.strength?.segmentKey,
      browserSummary.biggestStrength?.label,
    );
    const archetype = browserSummary.athleteArchetype?.label;
    const workRunBalance = browserSummary.workRunBalance?.profileTypeLabel ?? browserSummary.workRunBalance?.profileType;
    const heroInsight = browserSummary.heroInsight?.title;
    const benchmarkGroup = firstDefined(
      analysis.benchmarkContext?.primaryBenchmarkGroup?.label,
      analysis.benchmarkContext?.primaryBenchmarkGroup?.key,
    );
    const timePotential = browserSummary.timePotential?.headlineGainFormatted;
	    const overallPercentile = browserSummary.overallPercentile;
	    const overallPercentileLabel = browserSummary.overallPercentileLabel;
	    const ageBenchmark = analysis.benchmarkContext?.ageBenchmark;

    const divisionSuffix = division ? ` — ${division}` : "";
    let label;
    if (analysisScope === "no_benchmark_data") {
      label = `No benchmark data${divisionSuffix}`;
    } else if (limiter) {
      label = `Limiter: ${limiter}${divisionSuffix}`;
    } else if (archetype) {
      label = `${archetype}${divisionSuffix}`;
    } else {
      label = `Analysis${divisionSuffix}`;
    }

    const lines = [];
    if (analysisScope === "no_benchmark_data") {
      lines.push("No benchmark data — engine should degrade gracefully, no percentile or benchmark references.");
    } else {
	      if (overallPercentileLabel || overallPercentile != null) {
	        lines.push(`Benchmark position: ${overallPercentileLabel ?? `${overallPercentile}th percentile`}${benchmarkGroup ? ` (${benchmarkGroup})` : ""}`);
	      }
	      if (ageBenchmark?.available) {
	        lines.push(`Age benchmark available: ${ageBenchmark.label ?? ageBenchmark.ageGroup} (${ageBenchmark.sampleSize} records).`);
	      }
      if (limiter) lines.push(`Primary limiter: ${limiter} — commentary should address improvement strategies.`);
      if (strength) lines.push(`Primary strength: ${strength} — commentary should acknowledge this.`);
      if (workRunBalance) lines.push(`Run/work balance: ${workRunBalance}`);
      if (heroInsight) lines.push(`Hero insight: "${heroInsight}"`);
      if (timePotential) lines.push(`Time potential headline: ${timePotential}`);
      if (penaltyCount > 0) lines.push(`${penaltyCount} penalt${penaltyCount === 1 ? "y" : "ies"} — email should address penalty management.`);
      if (archetype) lines.push(`Athlete archetype: ${archetype}`);
    }

    return { label, expectedCommentary: lines.join("\n") };
  }

  router.post("/hyrox/test-harness/suggest", async (req, res) => {
    try {
      const urls = parseRequestedUrls(req.body);
      const validation = validateUrlList(urls);
      if (!validation.ok) return res.status(validation.status).json(validation.body);

      const targetFinishTimeSeconds = parseTargetTimeSeconds(req.body?.targetTime);
      if (!Number.isFinite(targetFinishTimeSeconds) || targetFinishTimeSeconds <= 0 || targetFinishTimeSeconds > 10_800) {
        return res.status(400).json({ error: "invalid_target_time" });
      }

      const url = urls[0];
      const importResult = await fetchAndParseHyroxUrl(url, pool);
      const analyseMode = { modeName: "Analyse", calculatorMode: "analyse", targetFinishTimeSeconds: null };
      let modeEntry;
      try {
        modeEntry = { mode: analyseMode, result: runMode(analyseMode, importResult.parsed, importResult.event, {}) };
      } catch (error) {
        modeEntry = { mode: analyseMode, error };
      }

      const suggestion = suggestLabelAndCommentary(importResult, modeEntry);
      return res.json({ ok: true, url, ...suggestion });
    } catch (error) {
      return res.status(422).json({ ok: false, error: error.message ?? "suggest_failed", reason: error.reason ?? "unknown" });
    }
  });

  // Race card: generate from a stored submission by ID (inline preview)
  router.get("/hyrox/test-harness/race-card/:submissionId", async (req, res) => {
    return handleAdminRaceCard(req, res, pool, false);
  });

  // Race card: generate as a downloadable attachment
  router.get("/hyrox/test-harness/race-card/:submissionId/download", async (req, res) => {
    return handleAdminRaceCard(req, res, pool, true);
  });

  // Race card: generate live from a URL (for test harness UI — no DB required)
  router.post("/hyrox/test-harness/race-card-url", async (req, res) => {
    const urls = parseRequestedUrls(req.body);
    if (!urls.length || !isValidHyroxResultsUrl(urls[0])) {
      return res.status(400).json({ error: "invalid_url" });
    }
    try {
      const importResult = await fetchAndParseHyroxUrl(urls[0], pool);
      const targetTime = parseTargetTimeSeconds(req.body?.targetTime);
      const mode = { modeName: "Race Card", calculatorMode: targetTime ? "target" : "analyse", targetFinishTimeSeconds: targetTime ?? null };
      const modeResult = runMode(mode, importResult.parsed, importResult.event, {});
      const athleteCtx = {
        displayName: displayAthleteName(importResult.parsed),
        division: importResult.parsed?.division ?? null,
        calculatorMode: mode.calculatorMode,
        ...(targetTime ? { targetTimeSeconds: targetTime, targetFinishTimeSeconds: targetTime } : {}),
      };
      const raceCardData = buildHyroxRaceCardData(modeResult.analysisJson, athleteCtx);
      const pngBuffer = await generateRaceCardPng(raceCardData);
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "no-store");
      return res.send(pngBuffer);
    } catch (error) {
      return res.status(422).json({ error: "race_card_failed", reason: error.reason ?? error.message ?? "unknown" });
    }
  });

  return router;
}

export const adminHyroxTestHarnessRouter = createAdminHyroxTestHarnessRouter();
