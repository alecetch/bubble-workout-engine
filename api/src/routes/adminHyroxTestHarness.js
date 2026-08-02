import express from "express";
import { ZipArchive } from "archiver";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pool as defaultPool } from "../db.js";
import { buildHyroxRaceCardData } from "../hyrox/reports/raceCardDataMapper.js";
import { buildHyroxReportContract } from "../hyrox/reports/reportContractBuilder.js";
import { generateRaceCardPng } from "../hyrox/sharePack/raceCardScreenshotter.js";
import { submissionInput } from "../hyrox/hyroxController.js";
import { parseHyroxResultsHtml } from "../hyrox/ingestion/parseHyroxResultsHtml.js";
import { parseHyroxResultsText } from "../hyrox/ingestion/parseHyroxResultsText.js";
import { analyseSubmission } from "../hyrox/engine/hyroxAnalysisEngine.js";
import { normaliseSubmission } from "../hyrox/engine/segmentNormaliser.js";
import { generateInsights } from "../hyrox/insights/insightEngine.js";
import { assembleReport } from "../hyrox/reports/reportAssembler.js";
import { buildCarouselPage } from "../hyrox/reports/carouselPageBuilder.js";
import { formatPercentileRank } from "../hyrox/reports/copyFormatter.js";
import { displaySegmentLabel } from "../hyrox/reports/segmentDisplay.js";
import { lookupHyroxEventByKey } from "../hyrox/services/hyroxEventsService.js";
import { detectHyroxDivisionFromUrl } from "../hyrox/ingestion/detectHyroxDivision.js";

const RESULTS_URL_PREFIX = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 12_000;
const HYROX_TARGET_TIME_MIN_SECONDS = 25 * 60;
const HYROX_TARGET_TIME_MAX_SECONDS = 5 * 60 * 60;

// In-process HTML cache — populated by the browser bookmarklet (bypasses WAF).
// Persisted to disk so cached pages survive server/container restarts.
const htmlCache = new Map(); // normalisedKey -> { html, url, cachedAt }
const PAGE_CACHE_FILE = process.env.HYROX_PAGE_CACHE_FILE || path.join(process.cwd(), ".cache", "hyrox-page-cache.json");

async function loadPageCacheFromDisk() {
  try {
    const raw = await fs.readFile(PAGE_CACHE_FILE, "utf8");
    for (const [key, value] of Object.entries(JSON.parse(raw))) htmlCache.set(key, value);
  } catch {
    // No cache file yet, or unreadable — start empty.
  }
}

async function savePageCacheToDisk() {
  try {
    await fs.mkdir(path.dirname(PAGE_CACHE_FILE), { recursive: true });
    await fs.writeFile(PAGE_CACHE_FILE, JSON.stringify(Object.fromEntries(htmlCache)), "utf8");
  } catch (error) {
    console.error("Failed to persist HYROX page cache:", error.message);
  }
}

await loadPageCacheFromDisk();

function normaliseCacheKey(url) {
  try {
    const u = new URL(url);
    const keepParams = ["idp", "event", "fpid", "pid", "pidp", "content", "lang"];
    const kept = {};
    for (const p of keepParams) if (u.searchParams.has(p)) kept[p] = u.searchParams.get(p);
    const sex = u.searchParams.get("search[sex]");
    if (sex) kept["search[sex]"] = sex;
    return u.origin + u.pathname + "?" + new URLSearchParams(Object.entries(kept).sort()).toString();
  } catch {
    return url;
  }
}

const FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  referer: "https://results.hyrox.com/",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "upgrade-insecure-requests": "1",
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
        canonical: entry?.canonical === true || entry?.expectations?.canonical === true,
        expectations: entry?.expectations && typeof entry.expectations === "object" ? { ...entry.expectations } : null,
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
    canonical: body.canonical === true || body.expectations?.canonical === true,
    expectations: body.expectations && typeof body.expectations === "object" ? { ...body.expectations } : null,
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

function hasTargetTimeInput(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

function isPlausibleHyroxTargetTimeSeconds(seconds) {
  return (
    Number.isFinite(seconds) &&
    seconds >= HYROX_TARGET_TIME_MIN_SECONDS &&
    seconds <= HYROX_TARGET_TIME_MAX_SECONDS
  );
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

function validateTargetTimeInput(raw, label = "targetTime") {
  const seconds = parseTargetTimeSeconds(raw);
  if (isPlausibleHyroxTargetTimeSeconds(seconds)) {
    return { ok: true, seconds };
  }

  const entered = String(raw ?? "").trim() || "(empty)";
  return {
    ok: false,
    seconds,
    message: `${label} target time "${entered}" must be a realistic HYROX finish time between ${formatSeconds(HYROX_TARGET_TIME_MIN_SECONDS)} and ${formatSeconds(HYROX_TARGET_TIME_MAX_SECONDS)}. Use 1:30:00 for 1 hour 30 minutes.`,
  };
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
  return normalizeHarnessMarkdownText(value);
}

const WINDOWS_1252_REVERSE = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const MOJIBAKE_MARKER_RE = /[ÃÂ]|[åæéè][\u0080-\u017f\u2018-\u2122]/;
const MOJIBAKE_CHUNK_RE = /[\u00c0-\u00ff\u0152\u0153\u0160\u0161\u0178\u2018-\u2122][\u00c0-\u00ff\u0152\u0153\u0160\u0161\u0178\u2018-\u2122\s&,'().-]{1,}/g;

function mojibakeScore(value) {
  const text = String(value ?? "");
  return (text.match(/[ÃÂ�]/g) ?? []).length * 3
    + (text.match(/[åæéè][\u0080-\u017f\u2018-\u2122]/g) ?? []).length * 2
    + (text.match(/[\u0080-\u009f]/g) ?? []).length;
}

function windows1252Bytes(value) {
  const bytes = [];
  for (const char of String(value ?? "")) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
    } else if (WINDOWS_1252_REVERSE.has(code)) {
      bytes.push(WINDOWS_1252_REVERSE.get(code));
    } else {
      return null;
    }
  }
  return Buffer.from(bytes);
}

function repairMojibakeCandidate(value) {
  const text = String(value ?? "");
  if (!MOJIBAKE_MARKER_RE.test(text)) return text;
  const bytes = windows1252Bytes(text);
  if (!bytes) return text;
  const repaired = bytes.toString("utf8");
  if (mojibakeScore(repaired) >= mojibakeScore(text)) return text;
  if ((repaired.match(/\uFFFD/g) ?? []).length > (text.match(/\uFFFD/g) ?? []).length) return text;
  return repaired;
}

export function normalizeHarnessMarkdownText(value) {
  const repaired = repairMojibakeCandidate(String(value ?? ""))
    .replace(MOJIBAKE_CHUNK_RE, (chunk) => repairMojibakeCandidate(chunk));
  return repaired
    .replaceAll("\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d", "-")
    .replaceAll("\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u0153", "-")
    .replaceAll("\u00c3\u00a2\u00cb\u2020\u00e2\u20ac\u2122", "-")
    .replaceAll("\u00c3\u201a", "")
    .replaceAll("\u00e2\u20ac\u201d", "-")
    .replaceAll("\u00e2\u20ac\u201c", "-")
    .replaceAll("\u00e2\u02c6\u2019", "-")
    .replaceAll("\u00e2\u2020\u2019", "->")
    .replaceAll("\u00c2", "")
    .replaceAll("&mdash;", "-")
    .replaceAll("&ndash;", "-");
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

function raceCardMarkdown(raceCardData) {
  if (!raceCardData) return "_No race card data generated._";

  const strongest = raceCardData.strongestStation;
  const limiter = raceCardData.biggestLimiter;
  const penalty = raceCardData.penaltySummary;
  const splitRows = Array.isArray(raceCardData.splitRows) ? raceCardData.splitRows : [];

  const rows = [
    `- Athlete: ${markdownValue(raceCardData.athleteName)}`,
    `- Mode: ${markdownValue(raceCardData.mode)}`,
	    `- Comparison basis: ${markdownValue(raceCardData.comparisonBasis)}`,
	    `- Finish time: ${markdownValue(raceCardData.finishTime)}`,
	    `- Target time: ${markdownValue(raceCardData.targetTime)}`,
    `- Target gap: ${markdownValue(raceCardData.targetGapFormatted)}`,
	    `- Percentile text: ${markdownValue(raceCardData.percentileText)}`,
    `- Confidence qualifier: ${markdownValue(raceCardData.confidenceQualifier)}`,
    `- Forma score: ${markdownValue(raceCardData.formaScore)}`,
    `- Is doubles: ${markdownValue(raceCardData.isDoubles)}`,
    `- ${markdownValue(strongest?.markdownLabel ?? strongest?.cardHeader ?? "Strongest station")}: ${strongest ? `${markdownValue(strongest.name)} (${markdownValue(strongest.percentile)})` : "-"}`,
    `- Biggest limiter: ${limiter ? `${markdownValue(limiter.name)} — potential gain ${markdownValue(limiter.potentialGain)}, ${markdownValue(limiter.rankText)}${limiter.isPenalty ? " [penalty]" : ""}` : "-"}`,
    `- Penalty summary: ${penalty ? `${markdownValue(penalty.label)} ${markdownValue(penalty.value)}${penalty.isDominant ? " (dominant)" : ""}` : "-"}`,
    `- Split rows: ${splitRows.length}`,
  ];

  if (splitRows.length) {
    rows.push("", "Split row detail:");
    for (const row of splitRows) {
      const adjustment = row.isPenaltyAdjusted
        ? `, adjusted from raw ${markdownValue(row.rawTimeFormatted ?? row.rawUserTime)} by ${markdownValue(row.penaltyAdjustmentFormatted)}`
        : "";
      rows.push(`  - ${markdownValue(row.label)}: ${markdownValue(row.userTime)}${adjustment}, delta ${markdownValue(row.delta)} (${markdownValue(row.tone)})`);
    }
  }

  rows.push("", "```json", maybeJson(raceCardData), "```");

  return rows.join("\n");
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
      const adjustment = station.penalty_adjusted
        ? `, adjusted from raw ${markdownValue(station.raw_time)} by ${markdownValue(station.penalty_adjustment)}`
        : "";
      rows.push(`- ${markdownValue(station.name)}: time ${markdownValue(station.time)}${adjustment}, target ${markdownValue(station.target_time ?? station.benchmark_time)}, delta ${markdownValue(station.delta)}, tone ${markdownValue(station.tone)}`);
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
    ? `${browserSummary.biggestStrength.label}${browserSummary.biggestStrength.summaryText ? ` (${browserSummary.biggestStrength.summaryText})` : ""}`
    : null;
  const limiter = browserSummary.biggestLimiter
    ? `${browserSummary.biggestLimiter.label}${browserSummary.biggestLimiter.timeGapFormatted ? ` — ${browserSummary.biggestLimiter.timeGapFormatted}` : ""}`
    : null;
  const fastestControllableWin = browserSummary.fastestControllableWin
    ? `${browserSummary.fastestControllableWin.label}${browserSummary.fastestControllableWin.timeGapFormatted ? ` — ${browserSummary.fastestControllableWin.timeGapFormatted}` : ""}`
    : null;
  const largestFitnessLimiter = browserSummary.largestFitnessLimiter
    ? `${browserSummary.largestFitnessLimiter.label}${browserSummary.largestFitnessLimiter.timeGapFormatted ? ` — ${browserSummary.largestFitnessLimiter.timeGapFormatted}` : ""}`
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
    if (fastestControllableWin) {
      rows.push(`| Fastest Controllable Win | ${markdownValue(fastestControllableWin)} |`);
      rows.push(`| Largest Fitness Limiter | ${markdownValue(largestFitnessLimiter)} |`);
    }
  } else {
    rows.push(`| Athlete Archetype | ${markdownValue(archetype)} |`);
    rows.push(`| Overall Benchmark | ${markdownValue(benchmark)}${benchmarkGroup ? ` — ${benchmarkGroup}` : ""} |`);
    rows.push(`| Biggest Strength | ${markdownValue(strength)} |`);
    if (fastestControllableWin) {
      rows.push(`| Fastest Controllable Win | ${markdownValue(fastestControllableWin)} |`);
      rows.push(`| Largest Fitness Limiter | ${markdownValue(largestFitnessLimiter)} |`);
    } else {
      rows.push(`| Biggest Limiter | ${markdownValue(limiter)} |`);
    }
    rows.push(`| Time Potential | ${markdownValue(timePotential)}${projectedTime ? ` → ${projectedTime}` : ""} |`);
  }

  if (heroInsight) rows.push(`| Hero Insight | ${markdownValue(heroInsight)}${heroMetric ? ` (${heroMetric})` : ""} |`);

  if (!rows.length) return "_No browser summary data available._";

  return `| Box | Value |\n|-----|-------|\n${rows.join("\n")}`;
}

function localTimestampSlug(date = new Date(), { separator = "-", includeSeconds = false } = {}) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}${separator}${hh}${mi}${includeSeconds ? ss : ""}`;
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

async function fetchHtml(url, { cacheOnly = false } = {}) {
  const cacheKey = normaliseCacheKey(url);
  const cached = htmlCache.get(cacheKey);
  if (cached) return cached.html;

  if (cacheOnly) {
    const error = new Error("No cached HYROX page found for this URL. Use the bookmarklet to cache it, or uncheck 'Use cached data only'.");
    error.reason = "cache_miss";
    throw error;
  }

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

async function fetchAndParseHyroxUrl(url, pool, { cacheOnly = false } = {}) {
  const html = await fetchHtml(url, { cacheOnly });
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

export function buildHarnessBody({ modeName, calculatorMode, targetFinishTimeSeconds, parsed, event, sharedContext = {} }) {
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

export function runHarnessMode(mode, parsed, event, sharedContext) {
  const body = buildHarnessBody({ ...mode, parsed, event, sharedContext });
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
  const contract = buildHyroxReportContract({ analysisJson, athleteContext, calculatorMode: mode.calculatorMode, insights });
  const reportRequest = { raceResult, analysisJson, insights, athleteContext, calculatorMode: mode.calculatorMode };

  return {
    mode,
    input,
    normalised,
    analysisJson,
    narrative: contract,
    contract,
    insights,
    emailReport: assembleReport({ ...reportRequest, outputType: "email_report" }),
    webReport: assembleReport({ ...reportRequest, outputType: "web_report" }),
    carouselReport: assembleReport({ ...reportRequest, outputType: "carousel_a" }),
    raceCardData: buildHyroxRaceCardData(analysisJson, athleteContext, contract),
  };
}

export function sharedContextFromRequestBody(body = {}) {
  return {
    weeklyStrengthSessions: body?.weeklyStrengthSessions ?? undefined,
    weeklyRunningVolume: body?.weeklyRunningVolume ?? undefined,
    primaryBackground: body?.primaryBackground ?? undefined,
    additionalContext: body?.additionalContext ?? undefined,
    backSquat3RMKg: body?.backSquat3RMKg ?? undefined,
    backSquatReps: body?.backSquatReps ?? undefined,
    deadlift3RMKg: body?.deadlift3RMKg ?? undefined,
    deadliftReps: body?.deadliftReps ?? undefined,
    bodyweightKg: body?.bodyweightKg ?? undefined,
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
    "### Race Card",
    "",
    raceCardMarkdown(result.raceCardData),
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
	    artifactConsistencyMarkdown(modeEntries),
      structuredExpectationMarkdown(modeEntries),
      contractSlotMarkdown(modeEntries),
      policyViolationMarkdown(modeEntries),
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

function normalizePrimaryLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\s+[—-]\s+.*$/, "")
    .replace(/\s+\([^)]*\)$/, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+station$/i, "")
    .replace(/\btotal\s+roxzone\s+time\b/gi, "RoxZone")
    .replace(/\broxzone\b/gi, "RoxZone")
    .trim();
  const lower = cleaned.toLowerCase();
  if (lower === "wall balls") return "Wall Balls";
  if (lower === "burpee broad jump") return "Burpee Broad Jump";
  if (lower === "farmers carry") return "Farmers Carry";
  if (lower === "sandbag lunges") return "Sandbag Lunges";
  if (lower === "sled push") return "Sled Push";
  if (lower === "sled pull") return "Sled Pull";
  if (lower === "skierg") return "SkiErg";
  if (lower === "row") return "Row";
  if (lower === "roxzone") return "RoxZone";
  if (lower === "penalties") return "Penalties";
  const runMatch = lower.match(/^run\s*([1-8])$/);
  if (runMatch) return `Run ${runMatch[1]}`;
  return displaySegmentLabel(null, cleaned) ?? cleaned;
}

function isKnownPrimaryLabel(label) {
  if (!label) return false;
  return [
    "Wall Balls",
    "Burpee Broad Jump",
    "Farmers Carry",
    "Sandbag Lunges",
    "Sled Push",
    "Sled Pull",
    "SkiErg",
    "Row",
    "RoxZone",
    "Penalties",
  ].includes(label) || /^Run\s+[1-8]$/i.test(label);
}

export function firstPrimaryFromText(text) {
  const value = removeEmailChromeText(text);
  if (/\bfastest win\b[\s\S]{0,80}\bpenalt/i.test(value) || /\bpenalt(?:y|ies)\b[\s\S]{0,80}\bfastest controllable win\b/i.test(value)) {
    return "Penalties";
  }
  const colonSubjectMatch = value.match(/^([A-Za-z0-9 ]{2,30}):\s+/);
  if (colonSubjectMatch) {
    const label = normalizePrimaryLabel(colonSubjectMatch[1]);
    if (isKnownPrimaryLabel(label)) return label;
  }
  const subjectMatch = value.match(/\bstart with\s+([A-Za-z0-9 ]+?)(?:[.!?<\n\r]|$|\s{2,})/i);
  if (subjectMatch) return normalizePrimaryLabel(subjectMatch[1]);
  const biggestMatch = value.match(/\bBiggest opportunit(?:y|ies):\s*([^.;<\n\r]+)/i);
  if (biggestMatch) return normalizePrimaryLabel(biggestMatch[1].split(/,|\band\b/i)[0]);
  const targetMatch = value.match(/\b(The\s+)?([A-Za-z0-9 ]+?)(?:\s+station)?\s+is\s+the\s+biggest target opportunity/i);
  if (targetMatch) return normalizePrimaryLabel(targetMatch[2]);
  const mainClaimMatch = value.match(/\b(The\s+)?([A-Za-z0-9 ]+?)(?:\s+station)?\s+is\s+the\s+main\s+(?:directional\s+|team\s+)?(?:target\s+limiter|target\s+opportunity|fitness\s+opportunity|fitness\s+limiter|opportunity)/i);
  if (mainClaimMatch) return normalizePrimaryLabel(mainClaimMatch[2]);
  return null;
}

function removeEmailChromeText(text) {
  return String(text ?? "")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\bgetforma\.fit\b/gi, " ")
    .replace(/\bForma\s+[^\s]+\s+Measure\.\s+Understand\.\s+Improve\.\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstPrimaryFromEmailHtml(html) {
  const raw = String(html ?? "");
  const mainInsightMatch = raw.match(/MAIN INSIGHT[\s\S]{0,5000}?<p[^>]*>([\s\S]*?)<\/p>/i);
  const mainInsightText = mainInsightMatch ? stripHtml(mainInsightMatch[1]) : null;
  return firstPrimaryFromText(mainInsightText) ?? firstPrimaryFromText(stripHtml(raw));
}

function mainInsightTextFromEmailHtml(html) {
  const raw = String(html ?? "");
  const mainInsightMatch = raw.match(/MAIN INSIGHT[\s\S]{0,5000}?<p[^>]*>([\s\S]*?)<\/p>/i);
  return mainInsightMatch ? stripHtml(mainInsightMatch[1]) : "";
}

function firstSentence(text) {
  return String(text ?? "").split(/(?<=[.!?])\s+/)[0] ?? "";
}

function artifactPolicyViolations(modeEntry = {}, fields = {}) {
  const result = modeEntry.result ?? {};
  const narrative = result.narrative ?? result.webReport?.browserSummary?.narrative ?? result.raceCardData?.narrative ?? null;
  const primary = narrative?.primaryClaim ?? narrative?.primaryOpportunity ?? null;
  const primaryLabel = normalizePrimaryLabel(primary?.normalizedLabel ?? primary?.displayLabel ?? primary?.label);
  const concretePrimary = primaryLabel && primaryLabel !== "Penalties";
  const mode = modeEntry.mode ?? {};
  const violations = [];
  const mainInsight = mainInsightTextFromEmailHtml(result.emailReport?.emailHtml ?? "");
  const opener = firstSentence(mainInsight);

  if (concretePrimary && mainInsight) {
    const categoryFirst = /\b(?:the\s+main\s+limiter\s+is|gap\s+is\s+led\s+by|station\s+(?:time|performance)\s+is|running\s+(?:pace\s+)?is|to hit\s+[^.]+,\s+the gap is led by)\b/i.test(opener);
    const openerPrimary = firstPrimaryFromText(opener);
    if (categoryFirst && openerPrimary !== primaryLabel) {
      violations.push(`email main insight opens category-first before ${primaryLabel}`);
    }
  }

  const selectedTargetTime = mode.targetFinishTimeSeconds
    ?? result.input?.targetFinishTimeSeconds
    ?? result.input?.targetTimeSeconds
    ?? result.analysisJson?.race?.targetTimeSeconds
    ?? null;
  if ((mode.calculatorMode === "target" || result.raceCardData?.mode === "target") && selectedTargetTime && result.raceCardData && !result.raceCardData.targetGapFormatted) {
    violations.push("target-mode race card missing exact target gap");
  }

  if (concretePrimary && /^Run\s+[1-8]$/i.test(primaryLabel)) {
    const haystack = [
      mainInsight,
      result.emailReport?.emailSubject,
      result.raceCardData?.biggestLimiter?.actionText,
      JSON.stringify(result.carouselReport?.slides ?? []),
    ].filter(Boolean).join(" ");
    const unsafe = haystack.match(/\b(?:attack\s+Run\s+1|go harder from the start|start by pushing Run\s+1)\b/i);
    if (unsafe) violations.push(`unsafe run-primary coaching cue: ${unsafe[0]}`);
  }

  return violations;
}

export function primaryFromHeroTitle(title, fallbackLabel = null) {
  const value = String(title ?? "");
  if (!value) return null;
  if (/\bRoxZone\b|\bRoxzone\b/i.test(value)) return "RoxZone";
  const routeMatch = value.match(/\bSTARTS WITH\s+([A-Z0-9 ]+)\b/);
  if (routeMatch) return normalizePrimaryLabel(routeMatch[1]);
  const biggestMatch = value.match(/^(.+?)\s+IS YOUR BIGGEST/i);
  if (biggestMatch) return normalizePrimaryLabel(biggestMatch[1]);
  const fastestWinMatch = value.match(/^(.+?)\s+(?:are|is)\s+your(?:\s+team's)?\s+fastest controllable win/i);
  if (fastestWinMatch) return normalizePrimaryLabel(fastestWinMatch[1]);
  return normalizePrimaryLabel(fallbackLabel);
}

function browserPrimaryFromSummary(browserSummary = {}, raceCardData = {}, carouselSlides = []) {
  const headlineMode = raceCardData?.artifactHeadlineMode
    ?? carouselSlides.find((slide) => slide?.artifact_headline_mode)?.artifact_headline_mode
    ?? null;
  if (headlineMode === "fitness_first_with_penalty_win") {
    return normalizePrimaryLabel(browserSummary.largestFitnessLimiter?.label ?? browserSummary.biggestLimiter?.label);
  }
  if (headlineMode === "penalty_first") {
    return normalizePrimaryLabel(browserSummary.fastestControllableWin?.label ?? browserSummary.biggestLimiter?.label);
  }
  return normalizePrimaryLabel(
    browserSummary.biggestLimiter?.label
      ?? browserSummary.largestFitnessLimiter?.label
      ?? browserSummary.fastestControllableWin?.label,
  );
}

export function artifactPrimaryConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const browserSummary = result.webReport?.browserSummary ?? {};
  const carouselSlides = result.carouselReport?.slides ?? [];
  const narrative = result.narrative ?? browserSummary.narrative ?? result.raceCardData?.narrative ?? null;
  const expected = normalizePrimaryLabel(
    narrative?.primaryClaim?.normalizedLabel
      ?? narrative?.primaryClaim?.label
      ?? narrative?.primaryOpportunity?.normalizedLabel
      ?? narrative?.primaryOpportunity?.displayLabel,
  );
  const fields = {
    narrative: expected,
    subject: firstPrimaryFromText(result.emailReport?.emailSubject),
    emailMain: firstPrimaryFromEmailHtml(result.emailReport?.emailHtml ?? ""),
    browserHero: primaryFromHeroTitle(
      browserSummary.heroInsight?.title,
      browserSummary.biggestLimiter?.label ?? browserSummary.largestFitnessLimiter?.label,
    ),
    browserLimiter: browserPrimaryFromSummary(browserSummary, result.raceCardData, carouselSlides),
    raceCard: normalizePrimaryLabel(result.raceCardData?.biggestLimiter?.name),
    carousel: normalizePrimaryLabel(carouselSlides[0]?.biggest_limiter ?? carouselSlides[3]?.station),
  };
  const required = {
    emailMain: Boolean(result.emailReport?.emailHtml),
    browserLimiter: Boolean(result.webReport?.browserSummary),
    raceCard: Boolean(result.raceCardData),
    carousel: carouselSlides.length > 0,
    subject: /\b(start with|fastest win|analysis:\s*start with)\b/i.test(String(result.emailReport?.emailSubject ?? "")),
    browserHero: Boolean(browserSummary.heroInsight?.title) && /\b(biggest|starts with|fastest win|opportunity)\b/i.test(String(browserSummary.heroInsight?.title ?? "")),
  };
  const missingRequired = Object.entries(required)
    .filter(([key, isRequired]) => isRequired && !fields[key]);
  const comparable = Object.entries(fields).filter(([, value]) => Boolean(value));
  const expectedLabel = expected ?? comparable[0]?.[1] ?? null;
	  const mismatches = expectedLabel
	    ? comparable.filter(([, value]) => value !== expectedLabel)
	    : [];
	  const unique = [...new Set(comparable.map(([, value]) => value))];
  const policyViolations = artifactPolicyViolations(modeEntry, fields);
	  const pass = missingRequired.length === 0 && policyViolations.length === 0 && (expectedLabel ? mismatches.length === 0 : unique.length <= 1);
  return {
    pass,
    fields,
    primary: expectedLabel ?? unique[0] ?? null,
    headlineMode: narrative?.headlineMode ?? result.raceCardData?.artifactHeadlineMode ?? null,
    rankClaimsAllowed: narrative?.rankDisplays?.allowed ?? null,
	    detail: pass
	      ? `primary ${expectedLabel ?? unique[0] ?? "not detected"}`
      : policyViolations.length
        ? policyViolations.join("; ")
	      : missingRequired.length
        ? `missing required primary extraction: ${missingRequired.map(([key]) => key).join(", ")}`
        : mismatches.length
        ? `expected ${expectedLabel}; ${mismatches.map(([key, value]) => `${key}=${value}`).join(", ")}`
        : comparable.map(([key, value]) => `${key}=${value}`).join(", "),
  };
}

function rankClaimConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const narrative = result.narrative ?? result.webReport?.browserSummary?.narrative ?? result.raceCardData?.narrative ?? null;
  const rankAllowed = narrative?.rankPolicy?.allowed ?? narrative?.rankDisplays?.allowed;
  if (rankAllowed !== false) {
    return { pass: true, detail: "rank claims allowed" };
  }
  const carouselSlides = result.carouselReport?.slides ?? [];
  const haystack = [
    result.emailReport?.emailSubject,
    stripHtml(result.emailReport?.emailHtml ?? ""),
    result.webReport?.browserSummary?.overallPercentileLabel,
    result.raceCardData?.percentileText,
    JSON.stringify(carouselSlides),
  ].filter(Boolean).join(" ");
  const forbidden = haystack.match(/\b(?:TOP|BOTTOM)\s+\d+%|\bWORLDWIDE\b|\bpercentile\b|WORLD RANK\s+[^\s-]/i);
  return {
    pass: !forbidden,
    detail: forbidden ? `rank claim leaked: ${forbidden[0]}` : "rank claims suppressed",
  };
}

function targetTimeZeroIssue(emailHtml) {
  const text = stripHtml(emailHtml).toUpperCase();
  return /TARGET TIME\s+(?:-|—|–)?\s*0:00\b/.test(text);
}

function dataQualityPolicyConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const narrative = result.narrative ?? result.webReport?.browserSummary?.narrative ?? result.raceCardData?.narrative ?? null;
  const claimStrength = narrative?.primaryClaim?.claimStrength ?? "firm";
  const caveatRequired = Boolean(narrative?.dataQualityPolicy?.caveatRequired);
  const carouselSlides = result.carouselReport?.slides ?? [];
  const compactLabels = [
    result.raceCardData?.biggestLimiter?.cardHeader,
    carouselSlides[0]?.biggest_limiter_label,
    carouselSlides[3]?.label,
  ].filter(Boolean).join(" ");
  if (claimStrength !== "firm" && /\bBIGGEST LIMITER\b|\bSTRONGEST STATION\b/i.test(compactLabels)) {
    return { pass: false, detail: `firm compact label leaked for ${claimStrength} claim` };
  }
  if (caveatRequired) {
    const haystack = [
      result.webReport?.browserSummary?.dataQualityNote,
      result.raceCardData?.biggestLimiter?.caption,
      carouselSlides[0]?.data_quality_note,
      carouselSlides[3]?.confidence_note,
      stripHtml(result.emailReport?.emailHtml ?? ""),
    ].filter(Boolean).join(" ");
    if (!/\bdirectional|estimated|missing|unavailable|unusual|incomplete\b/i.test(haystack)) {
      return { pass: false, detail: "required data-quality caveat not found in artifacts" };
    }
  }
  return { pass: true, detail: caveatRequired ? "data-quality caveat present" : "firm claims allowed" };
}

function expectationStatus(expected, actual, label) {
  if (expected === undefined || expected === null) return null;
  const normalizedExpected = typeof expected === "string" ? expected.toLowerCase() : expected;
  const normalizedActual = typeof actual === "string" ? actual.toLowerCase() : actual;
  return Object.is(normalizedExpected, normalizedActual)
    ? null
    : `${label} expected ${expected} but contract has ${actual ?? "-"}`;
}

function expectationAuditRow(name, expected, actual) {
  if (expected === undefined || expected === null) return null;
  const normalizedExpected = typeof expected === "string" ? expected.toLowerCase() : expected;
  const normalizedActual = typeof actual === "string" ? actual.toLowerCase() : actual;
  const pass = Object.is(normalizedExpected, normalizedActual);
  return {
    expectation: name,
    expected,
    actual: actual ?? null,
    pass,
    detail: pass ? "matches contract" : `${name} expected ${expected} but contract has ${actual ?? "-"}`,
  };
}

const REQUIRED_CANONICAL_EXPECTATION_FIELDS = [
  "targetFinishTimeSeconds",
  "analysisScope",
  "benchmarkAvailable",
  "headlineMode",
  "expectedTone",
];

function isCanonicalHarnessCase(modeEntry = {}) {
  return modeEntry.canonical === true || modeEntry.expectations?.canonical === true;
}

export function structuredExpectationConsistency(modeEntry = {}) {
  const expectations = modeEntry.expectations ?? null;
  if (!expectations) {
    const canonical = isCanonicalHarnessCase(modeEntry);
    return {
      pass: !canonical,
      detail: canonical ? "missing structured expectations for canonical harness case" : "no structured expectations for ad hoc case",
      rows: [{
        expectation: "expectations",
        expected: canonical ? "required" : "optional",
        actual: "missing",
        pass: !canonical,
        detail: canonical ? "canonical case missing structured expectations" : "ad hoc case may omit structured expectations",
      }],
    };
  }
  const canonicalMissingFields = isCanonicalHarnessCase(modeEntry)
    ? REQUIRED_CANONICAL_EXPECTATION_FIELDS.filter((field) => expectations[field] === undefined)
    : [];
  const result = modeEntry.result ?? {};
  const contract = result.narrative ?? result.contract ?? result.raceCardData?.narrative ?? null;
  const rows = [
    ...canonicalMissingFields.map((field) => ({
      expectation: field,
      expected: "required",
      actual: "missing",
      pass: false,
      detail: `canonical expectation missing ${field}`,
    })),
    expectationAuditRow("calculatorMode", expectations.calculatorMode, contract?.inputFacts?.calculatorMode ?? modeEntry.mode?.calculatorMode),
    modeEntry.mode?.calculatorMode === "target"
      ? expectationAuditRow("targetFinishTimeSeconds", expectations.targetFinishTimeSeconds, contract?.inputFacts?.targetTimeSeconds)
      : null,
    expectationAuditRow("analysisScope", expectations.analysisScope, contract?.inputFacts?.analysisScope ?? result.analysisJson?.analysisScope),
    expectationAuditRow("headlineMode", expectations.headlineMode, contract?.primaryTrack?.headlineMode ?? contract?.headlineMode),
    expectationAuditRow("expectedTone", expectations.expectedTone, contract?.targetAssessment?.status),
    expectationAuditRow("primaryLabel", expectations.primaryLabel, contract?.primaryTrack?.primary?.label ?? contract?.primaryClaim?.label),
    expectationAuditRow("rankAllowed", expectations.rankAllowed, contract?.rankPolicy?.allowed),
    expectationAuditRow("benchmarkAvailable", expectations.benchmarkAvailable, contract?.inputFacts?.benchmarkAvailable),
    expectationAuditRow("strengthPolicyStatus", expectations.strengthPolicyStatus, contract?.strengthPolicy?.status),
    expectationAuditRow("requiresOffsetWording", expectations.requiresOffsetWording, contract?.gapReconciliation?.requiresOffsetWording),
  ].filter(Boolean);
  const violations = [
    ...canonicalMissingFields.map((field) => `canonical expectation missing ${field}`),
    expectationStatus(expectations.calculatorMode, contract?.inputFacts?.calculatorMode ?? modeEntry.mode?.calculatorMode, "calculatorMode"),
    modeEntry.mode?.calculatorMode === "target"
      ? expectationStatus(expectations.targetFinishTimeSeconds, contract?.inputFacts?.targetTimeSeconds, "targetFinishTimeSeconds")
      : null,
    expectationStatus(expectations.analysisScope, contract?.inputFacts?.analysisScope ?? result.analysisJson?.analysisScope, "analysisScope"),
    expectationStatus(expectations.headlineMode, contract?.primaryTrack?.headlineMode ?? contract?.headlineMode, "headlineMode"),
    expectationStatus(expectations.expectedTone, contract?.targetAssessment?.status, "expectedTone"),
    expectationStatus(expectations.primaryLabel, contract?.primaryTrack?.primary?.label ?? contract?.primaryClaim?.label, "primaryLabel"),
    expectationStatus(expectations.rankAllowed, contract?.rankPolicy?.allowed, "rankAllowed"),
    expectationStatus(expectations.benchmarkAvailable, contract?.inputFacts?.benchmarkAvailable, "benchmarkAvailable"),
    expectationStatus(expectations.strengthPolicyStatus, contract?.strengthPolicy?.status, "strengthPolicyStatus"),
    expectationStatus(expectations.requiresOffsetWording, contract?.gapReconciliation?.requiresOffsetWording, "requiresOffsetWording"),
  ].filter(Boolean);

  return {
    pass: violations.length === 0,
    detail: violations.length ? violations.join("; ") : "structured expectations match contract",
    rows,
  };
}

function normalizeAuditText(value) {
  return String(value ?? "")
    .replace(/&mdash;|&ndash;/gi, "-")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim()
    .toLowerCase();
}

function includesNormalized(haystack, needle) {
  const expected = String(needle ?? "").trim();
  if (!expected) return true;
  return normalizeAuditText(haystack).includes(normalizeAuditText(expected));
}

function normalizedIndexOf(haystack, needle) {
  const expected = String(needle ?? "").trim();
  if (!expected) return -1;
  return normalizeAuditText(haystack).indexOf(normalizeAuditText(expected));
}

export function contractSlotAudit(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const contract = result.narrative ?? result.contract ?? result.raceCardData?.narrative ?? null;
  const slots = contract?.artifactSlots ?? {};
  if (!contract || !slots) return { pass: true, detail: "no contract slots" };
  const carouselSlides = result.carouselReport?.slides ?? [];
  const emailText = stripHtml(result.emailReport?.emailHtml ?? "");
  const violations = [];
  const add = (ok, detail) => { if (!ok) violations.push(detail); };

  add(includesNormalized(result.emailReport?.emailSubject, slots.email?.subjectPrimary), `email subject missing ${slots.email?.subjectPrimary}`);
  add(includesNormalized(mainInsightTextFromEmailHtml(result.emailReport?.emailHtml ?? ""), slots.email?.subjectPrimary), `email main insight missing primary ${slots.email?.subjectPrimary}`);
  if (slots.email?.reconciliation) {
    const reconciliationIndex = normalizedIndexOf(emailText, slots.email.reconciliation);
    add(reconciliationIndex >= 0, contract.gapReconciliation?.requiresOffsetWording ? "email missing required reconciliation offset wording" : "email missing contract reconciliation wording");
    if (reconciliationIndex > 0) {
      const beforeReconciliation = emailText.slice(0, reconciliationIndex);
      add(!/\b(?:against the .*?(?:benchmark|target profile).*?(?:largest positive gap|both stations)|your largest positive gap|total gap vs the benchmark median)\b/i.test(beforeReconciliation), "email renders local reconciliation before contract reconciliation");
    }
  }
  add(normalizePrimaryLabel(result.raceCardData?.biggestLimiter?.name) === normalizePrimaryLabel(slots.raceCard?.heroPrimary), `race-card primary ${result.raceCardData?.biggestLimiter?.name ?? "-"} != ${slots.raceCard?.heroPrimary ?? "-"}`);
  if (modeEntry.mode?.calculatorMode === "target" && slots.raceCard?.targetGap) {
    add(result.raceCardData?.targetGapFormatted === slots.raceCard.targetGap, `race-card target gap ${result.raceCardData?.targetGapFormatted ?? "-"} != ${slots.raceCard.targetGap}`);
  }
  if (slots.raceCard?.strengthLabel && result.raceCardData?.strongestStation) {
    add(normalizePrimaryLabel(result.raceCardData.strongestStation.name) === normalizePrimaryLabel(slots.raceCard.strengthLabel), `race-card strength ${result.raceCardData.strongestStation.name} != ${slots.raceCard.strengthLabel}`);
  }
  if (contract.strengthPolicy?.status === "fastest_ahead_split_only" && result.raceCardData?.strongestStation) {
    const strengthSurface = `${result.raceCardData.strongestStation.cardHeader ?? ""} ${result.raceCardData.strongestStation.markdownLabel ?? ""}`;
    add(!/\bstrongest station\b/i.test(strengthSurface), "fastest-ahead split rendered as strongest station");
    add(/\bbest relative split\b/i.test(strengthSurface), "fastest-ahead split missing best-relative label");
  }
  add(normalizePrimaryLabel(carouselSlides[0]?.biggest_limiter) === normalizePrimaryLabel(slots.carousel?.slide1Primary), `carousel primary ${carouselSlides[0]?.biggest_limiter ?? "-"} != ${slots.carousel?.slide1Primary ?? "-"}`);
  if (slots.carousel?.slide1Metric2) {
    const metricValue = carouselSlides[0]?.metric2_value ?? carouselSlides[0]?.world_rank;
    add(carouselSlides[0]?.metric2_label === slots.carousel.slide1Metric2.label, `carousel slide 1 metric label ${carouselSlides[0]?.metric2_label ?? "-"} != ${slots.carousel.slide1Metric2.label}`);
    add(metricValue === slots.carousel.slide1Metric2.value, `carousel slide 1 metric value ${metricValue ?? "-"} != ${slots.carousel.slide1Metric2.value}`);
    add(!/^(?:|-|null|undefined)$/i.test(String(metricValue ?? "")), "carousel slide 1 metric value is blank");
  }
  add(carouselSlides[5]?.headline === slots.carousel?.ctaHeadline, `carousel CTA ${carouselSlides[5]?.headline ?? "-"} != ${slots.carousel?.ctaHeadline ?? "-"}`);
  if (slots.carousel?.strengthLabel) {
    add(normalizePrimaryLabel(carouselSlides[2]?.station) === normalizePrimaryLabel(slots.carousel.strengthLabel), `carousel strength ${carouselSlides[2]?.station ?? "-"} != ${slots.carousel.strengthLabel}`);
  }
  if (slots.carousel?.slide2Gain?.station) {
    add(normalizePrimaryLabel(carouselSlides[1]?.biggest_gain?.station) === normalizePrimaryLabel(slots.carousel.slide2Gain.station), `carousel biggest gain ${carouselSlides[1]?.biggest_gain?.station ?? "-"} != ${slots.carousel.slide2Gain.station}`);
  }
  if (contract.gapReconciliation?.requiresOffsetWording && slots.carousel?.reconciliation) {
    const carouselText = JSON.stringify(carouselSlides);
    add(includesNormalized(`${emailText} ${carouselText}`, slots.carousel.reconciliation), "required offset wording absent from artifact text");
  }
  if (contract.strengthPolicy?.status === "fastest_ahead_split_only") {
    const featureText = (carouselSlides[5]?.features ?? []).join(" ");
    add(!/\bstrongest station\b/i.test(featureText), "carousel feature list labels fastest-ahead split as strongest station");
    if (Array.isArray(slots.carousel?.features)) {
      add(includesNormalized(featureText, slots.carousel.features.join(" ")), "carousel feature list does not match contract features");
    }
  }
  if (contract.roxzonePolicy?.copyPrecision !== "exact") {
    const roxText = [
      result.raceCardData?.biggestLimiter?.caption,
      carouselSlides[0]?.roxzone_action?.detail,
      carouselSlides[3]?.confidence_note,
    ].filter(Boolean).join(" ");
    add(!/\b(?:exact|definitely|precise)\b/i.test(roxText), "over-precise RoxZone wording leaked for directional policy");
  }

  return {
    pass: violations.length === 0,
    detail: violations.length ? violations.join("; ") : "contract slots rendered",
  };
}

function splitRowDisplayConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const raceRows = result.raceCardData?.splitRows ?? [];
  const carouselRows = result.carouselReport?.slides?.find((slide) => Array.isArray(slide?.stations))?.stations ?? [];
  const violations = [];

  for (const row of raceRows) {
    if (!row?.isPenaltyAdjusted) continue;
    if (!row.penaltyAdjustmentLabel && !row.rawTimeFormatted && !row.rawUserTime) {
      violations.push(`${row.label} missing penalty-adjustment display label`);
    }
    const carousel = carouselRows.find((item) => normalizePrimaryLabel(item?.name) === normalizePrimaryLabel(row.label));
    if (carousel) {
      if (carousel.delta !== row.delta || carousel.tone !== row.tone) {
        violations.push(`${row.label} race-card/carousel adjusted gap mismatch`);
      }
      if (!carousel.penalty_adjusted || !carousel.penalty_adjustment_label) {
        violations.push(`${row.label} carousel missing penalty-adjustment label`);
      }
    }
  }

  return {
    pass: violations.length === 0,
    detail: violations.length ? violations.join("; ") : "split row display contract ok",
  };
}

function secondaryCoachingConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const narrative = result.narrative ?? result.raceCardData?.narrative ?? null;
  const secondary = narrative?.secondaryCoaching ?? null;
  const expected = normalizePrimaryLabel(secondary?.largestFitnessLimiter?.normalizedLabel ?? secondary?.largestFitnessLimiter?.label);
  if (!expected) return { pass: true, detail: "no secondary fitness limiter" };

  const carouselLimiter = normalizePrimaryLabel(result.carouselReport?.slides?.[0]?.largest_fitness_limiter?.station);
  const raceLimiter = normalizePrimaryLabel(result.raceCardData?.largestFitnessLimiter?.name);
  const emailText = stripHtml(result.emailReport?.emailHtml ?? "");
  const omissions = [];
  if (carouselLimiter && carouselLimiter !== expected) omissions.push(`carousel largest fitness limiter ${carouselLimiter}`);
  if (raceLimiter && raceLimiter !== expected) omissions.push(`race-card largest fitness limiter ${raceLimiter}`);
  if (/\bBiggest fitness opportunities:/i.test(emailText) && !new RegExp(`\\b${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(emailText)) {
    omissions.push(`email biggest fitness opportunities omit ${expected}`);
  }

  return {
    pass: omissions.length === 0,
    detail: omissions.length ? omissions.join("; ") : `secondary fitness limiter ${expected}`,
  };
}

function confidenceLanguageConsistency(modeEntry = {}) {
  const result = modeEntry.result ?? {};
  const narrative = result.narrative ?? result.raceCardData?.narrative ?? null;
  const claimStrength = narrative?.primaryClaim?.claimStrength ?? null;
  const roxAction = result.carouselReport?.slides?.[0]?.roxzone_action ?? null;
  const violations = [];

  if (roxAction?.confidence === "detailed" && !roxAction.action_evidence_level) {
    violations.push("roxzone_action uses detailed as confidence without action_evidence_level");
  }
  if (claimStrength && roxAction?.claim_confidence && roxAction.claim_confidence !== claimStrength) {
    violations.push(`carousel claim confidence ${roxAction.claim_confidence} differs from contract ${claimStrength}`);
  }
  if (claimStrength && claimStrength !== "firm" && result.raceCardData?.biggestLimiter?.claimStrength === "firm") {
    violations.push("race-card firm claim leaked for directional contract");
  }

  return {
    pass: violations.length === 0,
    detail: violations.length ? violations.join("; ") : "confidence language separated",
  };
}

function parseFlexibleTime(value) {
  const parts = String(value ?? "").trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function labelInputConsistency(modeEntry = {}) {
  const label = String(modeEntry.label ?? "").trim();
  if (!label) return { pass: true, detail: "no explicit label assertions" };
  const result = modeEntry.result ?? {};
  const assertions = [];
  const finishMatch = label.match(/\bfinish(?:es)?\s+([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);
  const targetMatch = label.match(/\btarget\s+([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);
  const expectsAhead = /\b(?:under target|ahead of target|green display)\b/i.test(label);
  const expectsBehind = /\b(?:over target|behind target|red display)\b/i.test(label);
  if (finishMatch) assertions.push(["finish", parseFlexibleTime(finishMatch[1]), result.analysisJson?.race?.finishTimeSeconds, finishMatch[1]]);
  if (targetMatch && modeEntry.mode?.calculatorMode === "target") assertions.push(["target", parseFlexibleTime(targetMatch[1]), modeEntry.mode?.targetFinishTimeSeconds, targetMatch[1]]);

  const violations = assertions
    .filter(([, expected, actual]) => Number.isFinite(expected) && Number.isFinite(actual) && Math.round(expected) !== Math.round(actual))
    .map(([name, expected,, raw]) => `label ${name} ${raw} but generated ${name} is ${name === "target" ? markdownValue(result.raceCardData?.targetTime) : markdownValue(result.raceCardData?.finishTime)}`);
  const gap = result.raceCardData?.targetGapSeconds;
  if (modeEntry.mode?.calculatorMode === "target" && Number.isFinite(gap)) {
    if (expectsAhead && gap > 0) violations.push(`label expects green/ahead but exact target gap is ${result.raceCardData?.targetGapSigned}`);
    if (expectsBehind && gap < 0) violations.push(`label expects red/behind but exact target gap is ${result.raceCardData?.targetGapSigned}`);
  }

  return {
    pass: violations.length === 0,
    detail: violations.length ? violations.join("; ") : assertions.length || expectsAhead || expectsBehind ? "label assertions match generated inputs" : "no explicit label assertions",
  };
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
    {
      name: "cross_artifact_primary_consistency",
      ...(() => {
        const audit = artifactPrimaryConsistency(entry);
        return { pass: audit.pass, detail: audit.detail };
      })(),
    },
    {
      name: "structured_expectation_contract",
      ...structuredExpectationConsistency(entry),
    },
    {
      name: "contract_slot_audit",
      ...contractSlotAudit(entry),
    },
    {
      name: "rank_claim_contract",
      ...rankClaimConsistency(entry),
    },
    {
      name: "data_quality_claim_contract",
      ...dataQualityPolicyConsistency(entry),
    },
    {
      name: "split_row_display_contract",
      ...splitRowDisplayConsistency(entry),
    },
    {
      name: "secondary_coaching_contract",
      ...secondaryCoachingConsistency(entry),
    },
    {
      name: "confidence_language_contract",
      ...confidenceLanguageConsistency(entry),
    },
    {
      name: "label_input_consistency",
      ...labelInputConsistency(entry),
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
        detail: targetTimeZeroIssue(emailHtml) ? "found TARGET TIME 0:00" : "no TARGET TIME 0:00 found",
      },
      {
        name: "target_race_card_has_exact_target_gap",
        pass: Boolean(result.raceCardData?.targetGapFormatted),
        detail: result.raceCardData?.targetGapFormatted
          ? `target gap ${result.raceCardData.targetGapSigned ?? result.raceCardData.targetGapFormatted}`
          : "missing exact target gap",
      },
      {
        name: "target_has_goal_benchmark_group",
        pass: true,
        detail: result.analysisJson?.benchmarkContext?.goalBenchmarkGroup != null
          ? "goalBenchmarkGroup present"
          : "goalBenchmarkGroup unavailable; exact target gap is used separately",
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

function artifactConsistencyMarkdown(modeEntries) {
  const rows = [
    "## Cross-Artifact Primary Consistency",
    "",
    "| Mode | Headline mode | Narrative primary | Subject | Email main | Browser hero | Browser limiter | Race card | Carousel | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const entry of modeEntries) {
    if (!entry.result) {
      rows.push(`| ${markdownValue(entry.mode?.modeName)} | - | - | - | - | - | - | - | - | FAIL |`);
      continue;
    }
    const audit = artifactPrimaryConsistency(entry);
    const f = audit.fields;
    rows.push(`| ${markdownValue(entry.mode?.modeName)} | ${markdownValue(audit.headlineMode)} | ${markdownValue(f.narrative)} | ${markdownValue(f.subject)} | ${markdownValue(f.emailMain)} | ${markdownValue(f.browserHero)} | ${markdownValue(f.browserLimiter)} | ${markdownValue(f.raceCard)} | ${markdownValue(f.carousel)} | ${audit.pass ? "PASS" : "FAIL"} |`);
  }
  rows.push("");
  return rows.join("\n");
}

function structuredExpectationMarkdown(modeEntries) {
  const rows = [
    "## Structured Expectation Audit",
    "",
    "| Mode | Expectation | Expected | Actual | Status | Detail |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const entry of modeEntries) {
    const audit = entry.result ? structuredExpectationConsistency(entry) : { pass: false, detail: entry.error?.message ?? "mode failed" };
    const detailRows = Array.isArray(audit.rows) && audit.rows.length
      ? audit.rows
      : [{ expectation: "mode", expected: "success", actual: "failed", pass: audit.pass, detail: audit.detail }];
    for (const detailRow of detailRows) {
      rows.push(`| ${markdownValue(entry.mode?.modeName)} | ${markdownValue(detailRow.expectation)} | ${markdownValue(detailRow.expected)} | ${markdownValue(detailRow.actual)} | ${detailRow.pass ? "PASS" : "FAIL"} | ${markdownValue(detailRow.detail)} |`);
    }
  }
  rows.push("");
  return rows.join("\n");
}

function contractSlotMarkdown(modeEntries) {
  const rows = [
    "## Contract Slot Audit",
    "",
    "| Mode | Status | Detail |",
    "| --- | --- | --- |",
  ];
  for (const entry of modeEntries) {
    const audit = entry.result ? contractSlotAudit(entry) : { pass: false, detail: entry.error?.message ?? "mode failed" };
    rows.push(`| ${markdownValue(entry.mode?.modeName)} | ${audit.pass ? "PASS" : "FAIL"} | ${markdownValue(audit.detail)} |`);
  }
  rows.push("");
  return rows.join("\n");
}

function policyViolationMarkdown(modeEntries) {
  const rows = [
    "## Policy Violation Audit",
    "",
    "| Mode | Policy | Status | Detail |",
    "| --- | --- | --- | --- |",
  ];
  for (const entry of modeEntries) {
    if (!entry.result) {
      rows.push(`| ${markdownValue(entry.mode?.modeName)} | mode | FAIL | ${markdownValue(entry.error?.message ?? "mode failed")} |`);
      continue;
    }
    for (const [policy, audit] of [
      ["rank", rankClaimConsistency(entry)],
      ["data-quality", dataQualityPolicyConsistency(entry)],
      ["confidence", confidenceLanguageConsistency(entry)],
      ["secondary", secondaryCoachingConsistency(entry)],
    ]) {
      rows.push(`| ${markdownValue(entry.mode?.modeName)} | ${policy} | ${audit.pass ? "PASS" : "FAIL"} | ${markdownValue(audit.detail)} |`);
    }
  }
  rows.push("");
  return rows.join("\n");
}

function buildMarkdown({ sourceUrl, eventLookupKey, parsed, event, targetFinishTimeSeconds, modeEntries, divisionDetection, label = "", expectedCommentary = "", canonical = false, expectations = null }) {
  const athleteDisplayName = displayAthleteName(parsed);
  const structuredExpectationFailures = modeEntries.filter((entry) => entry.result && !structuredExpectationConsistency(entry).pass).length;
  const contractSlotFailures = modeEntries.filter((entry) => entry.result && !contractSlotAudit(entry).pass).length;
  const legacyCrossArtifactFailures = modeEntries.filter((entry) => entry.result && !artifactPrimaryConsistency(entry).pass).length;
  const policyViolationFailures = modeEntries.filter((entry) => entry.result && [
    rankClaimConsistency(entry),
    dataQualityPolicyConsistency(entry),
    confidenceLanguageConsistency(entry),
    secondaryCoachingConsistency(entry),
  ].some((audit) => !audit.pass)).length;
  const metadata = [
    "# HYROX QA Test Harness",
    "",
    "## Metadata",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    ...(label ? [`- Label: ${markdownValue(label)}`] : []),
    ...(canonical ? ["- Canonical regression case: true"] : []),
    ...(expectations ? [`- Structured expectations: ${markdownValue(JSON.stringify(expectations))}`] : []),
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
    `- Structured expectation failures: ${structuredExpectationFailures}`,
    `- Contract slot failures: ${contractSlotFailures}`,
    `- Policy violation failures: ${policyViolationFailures}`,
    `- Legacy cross-artifact failures: ${legacyCrossArtifactFailures}`,
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
    `# Test Case ${index + 1} of ${total}: ${displayLabel}`,
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

async function runHarnessCase({ url, pool, targetFinishTimeSeconds, sharedContext, label = "", expectedCommentary = "", canonical = false, expectations = null, cacheOnly = false }) {
  const importResult = await fetchAndParseHyroxUrl(url, pool, { cacheOnly });
  const modes = [
    { modeName: "Mode 1: Analyse my race", calculatorMode: "analyse", targetFinishTimeSeconds: null },
    { modeName: "Mode 3: Hit a target time", calculatorMode: "target", targetFinishTimeSeconds },
  ];

  const modeEntries = modes.map((mode) => {
    try {
	      return { mode, label, expectedCommentary, canonical, expectations, result: runHarnessMode(mode, importResult.parsed, importResult.event, sharedContext) };
    } catch (error) {
	      return { mode, label, expectedCommentary, canonical, expectations, error };
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
    canonical,
    expectations,
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
      canonical,
      expectations,
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
        `# Test Case ${index + 1} of ${entries.length}: ${entry.label || entry.url}`,
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
      const labelPrefix = entry.label ? `[${entry.label}] ` : "";
      return `- ${index + 1}. ${labelPrefix}${entry.url} - target ${target} - ${status}`;
    }),
    "",
  ];

  for (const [index, entry] of entries.entries()) {
    rows.push("---", "");
    if (entry.result) {
      rows.push(caseHeading(index, entries.length, entry.url, entry.result, entry.label), artifactMarkdown(artifact, entry.result));
    } else {
      rows.push(
        `# Test Case ${index + 1} of ${entries.length}: ${entry.label || entry.url}`,
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

function emailHtmlForModeEntry(modeEntry, modeIndex = 0) {
  const subject = modeEntry.result?.emailReport?.emailSubject ?? "";
  return modeEntry.result?.emailReport?.emailHtml || `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject || "No email HTML generated")}</title></head>
<body>
  <h1>No email HTML generated</h1>
  <p>Mode: ${escapeHtml(modeEntry.mode?.modeName ?? `Mode ${modeIndex + 1}`)}</p>
  <p>Subject: ${escapeHtml(subject)}</p>
  <p>This harness mode completed, but the email renderer did not return HTML.</p>
</body>
</html>`;
}

export function emailHtmlEntriesFromHarnessEntries(entries = []) {
  const files = [];
  for (const [caseIndex, entry] of entries.entries()) {
    if (!entry.result) continue;
    const athlete = entry.result.parsed ? displayAthleteName(entry.result.parsed) : `case-${caseIndex + 1}`;
    for (const [modeIndex, modeEntry] of entry.result.modeEntries.entries()) {
      if (modeEntry.error) continue;
      const modeSlug = modeEntry.mode?.calculatorMode ?? `mode-${modeIndex + 1}`;
      files.push({
        name: `${String(caseIndex + 1).padStart(2, "0")}-${nameSlug(athlete)}-${modeSlug}.html`,
        html: emailHtmlForModeEntry(modeEntry, modeIndex),
      });
    }
  }
  return files;
}

function harnessRunId(date = new Date()) {
  return `${localTimestampSlug(date, { separator: "T", includeSeconds: true })}-${crypto.randomBytes(4).toString("hex")}`;
}

export function resolveHarnessRunsBaseDir() {
  return process.env.HYROX_HARNESS_RUNS_DIR || path.join(process.cwd(), "docs", "test_plans", "harness-runs");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function canonicalJsonStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJsonStringify(entry)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key])}`).join(",")}}`;
}

export function contentHashForAnalysisJson(analysisJson) {
  return crypto
    .createHash("sha256")
    .update(canonicalJsonStringify(analysisJson) ?? "undefined")
    .digest("hex");
}

export async function enforceHarnessRunRetention(baseDir, maxRuns = Number(process.env.HYROX_HARNESS_RUNS_MAX_KEPT) || 50) {
  if (!Number.isFinite(maxRuns) || maxRuns < 1) return;
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  await Promise.all(
    runDirs.slice(maxRuns).map((name) => fs.rm(path.join(baseDir, name), { recursive: true, force: true })),
  );
}

export async function persistHarnessRun(entries = [], { isPack = false } = {}) {
  const runId = harnessRunId();
  const baseDir = resolveHarnessRunsBaseDir();
  const runDir = path.join(baseDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  const cases = [];
  for (const [caseIndex, entry] of entries.entries()) {
    const caseNumber = String(caseIndex + 1).padStart(2, "0");
    if (!entry.result) {
      cases.push({
        url: entry.url,
        label: entry.label || "",
        expectedCommentary: entry.expectedCommentary || "",
        canonical: entry.canonical === true,
        expectations: entry.expectations ?? null,
        athleteDisplayName: null,
        targetFinishTimeSeconds: entry.targetFinishTimeSeconds ?? null,
        ok: false,
        reason: entry.reason ?? "parse_failed",
        modes: [],
      });
      continue;
    }

    const modes = [];
    for (const [modeIndex, modeEntry] of entry.result.modeEntries.entries()) {
      if (modeEntry.error) continue;
      const modeSlug = modeEntry.mode?.calculatorMode ?? `mode-${modeIndex + 1}`;
      const emailFile = `${caseNumber}-${modeSlug}-email.html`;
      const carouselFile = `${caseNumber}-${modeSlug}-carousel.json`;
      await fs.writeFile(path.join(runDir, emailFile), emailHtmlForModeEntry(modeEntry, modeIndex), "utf8");
      await writeJson(path.join(runDir, carouselFile), {
        slides: modeEntry.result?.carouselReport?.slides ?? [],
        carouselHtml: modeEntry.result?.carouselReport?.carousel ? buildCarouselPage(modeEntry.result.carouselReport.carousel) : "",
      });
      modes.push({
        modeName: modeEntry.mode?.modeName ?? `Mode ${modeIndex + 1}`,
        calculatorMode: modeEntry.mode?.calculatorMode ?? null,
        contentHash: contentHashForAnalysisJson(modeEntry.result?.analysisJson),
        emailFile,
        carouselFile,
      });
    }

    cases.push({
      url: entry.url,
      label: entry.label || entry.result.label || "",
      expectedCommentary: entry.expectedCommentary || entry.result.expectedCommentary || "",
      canonical: entry.canonical === true || entry.result.canonical === true,
      expectations: entry.expectations ?? entry.result.expectations ?? null,
      athleteDisplayName: displayAthleteName(entry.result.parsed),
      targetFinishTimeSeconds: entry.targetFinishTimeSeconds ?? entry.result.targetFinishTimeSeconds ?? null,
      ok: true,
      reason: null,
      modes,
    });
  }

  const qaMarkdown = isPack
    ? buildPackMarkdown({ entries })
    : entries[0]?.result?.markdown ?? "";
  await writeJson(path.join(runDir, "manifest.json"), {
    runId,
    generatedAt: new Date().toISOString(),
    isPack,
    cases,
  });
  await fs.writeFile(path.join(runDir, "qa.md"), qaMarkdown, "utf8");
  await enforceHarnessRunRetention(baseDir);
  return { runId, runDir };
}

async function persistHarnessRunSafely(entries, options) {
  try {
    return await persistHarnessRun(entries, options);
  } catch (error) {
    console.warn("[hyrox-test-harness] failed to persist harness run", error);
    return null;
  }
}

async function readHarnessAssessments(baseDir) {
  try {
    const raw = await fs.readFile(path.join(baseDir, "_assessments.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[hyrox-test-harness] failed to read harness assessments", error);
    }
    return {};
  }
}

async function listHarnessRunManifests(baseDir) {
  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const runDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  const manifests = [];
  for (const runId of runDirs) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(baseDir, runId, "manifest.json"), "utf8"));
      manifests.push({ runId, manifest });
    } catch (error) {
      console.warn("[hyrox-test-harness] failed to read harness run manifest", { runId, error });
    }
  }
  return manifests;
}

async function harnessRunsPayload() {
  const baseDir = resolveHarnessRunsBaseDir();
  const assessments = await readHarnessAssessments(baseDir);
  const manifests = await listHarnessRunManifests(baseDir);
  return {
    runs: manifests.map(({ runId, manifest }) => ({
      runId: manifest.runId ?? runId,
      generatedAt: manifest.generatedAt ?? null,
      cases: (manifest.cases ?? []).map((testCase) => ({
        url: testCase.url ?? null,
        label: testCase.label ?? "",
        expectedCommentary: testCase.expectedCommentary ?? "",
        canonical: testCase.canonical === true,
        expectations: testCase.expectations ?? null,
        ok: Boolean(testCase.ok),
        modes: (testCase.modes ?? []).map((mode) => {
          const key = `${testCase.url}|${mode.calculatorMode}`;
          const lastAssessment = assessments[key] ?? null;
          return {
            modeName: mode.modeName ?? null,
            calculatorMode: mode.calculatorMode ?? null,
            contentHash: mode.contentHash ?? null,
            needsReview: !lastAssessment || lastAssessment.contentHash !== mode.contentHash,
            lastAssessment,
          };
        }),
      })),
    })),
  };
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

async function generateRaceCardPngForCase(testCase, pool, cacheOnly) {
  const hasTargetTime = hasTargetTimeInput(testCase.targetTime);
  const targetValidation = hasTargetTime ? validateTargetTimeInput(testCase.targetTime, "targetTime") : { ok: true, seconds: null };
  if (!targetValidation.ok) {
    const err = new Error(targetValidation.message);
    err.reason = "invalid_target_time";
    throw err;
  }

  const importResult = await fetchAndParseHyroxUrl(testCase.url, pool, { cacheOnly });
  const targetTime = targetValidation.seconds;
  const mode = { modeName: "Race Card", calculatorMode: targetTime ? "target" : "analyse", targetFinishTimeSeconds: targetTime ?? null };
  const modeResult = runHarnessMode(mode, importResult.parsed, importResult.event, {});
  const athleteCtx = {
    displayName: displayAthleteName(importResult.parsed),
    division: importResult.parsed?.division ?? null,
    calculatorMode: mode.calculatorMode,
    ...(targetTime ? { targetTimeSeconds: targetTime, targetFinishTimeSeconds: targetTime } : {}),
  };
  const raceCardData = buildHyroxRaceCardData(modeResult.analysisJson, athleteCtx);
  const pngBuffer = await generateRaceCardPng(raceCardData);
  return { pngBuffer, parsed: importResult.parsed };
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

function previewPayload({ entries, persistedRun = null }) {
  const runId = persistedRun?.runId ?? null;
  return {
    success: entries.some((entry) => entry.result),
    generatedAt: new Date().toISOString(),
    runId,
    harnessRun: runId ? { runId, runDir: persistedRun.runDir ?? null } : null,
    cases: entries.map(previewCase),
  };
}

function applyHarnessRunHeaders(res, persistedRun) {
  if (!persistedRun?.runId) return;
  res.setHeader("X-Hyrox-Harness-Run-Id", persistedRun.runId);
  if (persistedRun.runDir) {
    res.setHeader("X-Hyrox-Harness-Run-Dir", persistedRun.runDir);
  }
}

function markdownWithHarnessRun(markdown, persistedRun) {
  const bom = "\uFEFF";
  if (!persistedRun?.runId) return `${bom}${normalizeHarnessMarkdownText(markdown)}`;
  const lines = [
    "# Harness Run",
    "",
    `- Run ID: ${persistedRun.runId}`,
  ];
  if (persistedRun.runDir) {
    lines.push(`- Run directory: ${persistedRun.runDir}`);
  }
  return `${bom}${normalizeHarnessMarkdownText(`${lines.join("\n")}\n\n${markdown}`)}`;
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

async function handleAdminStoredEmail(req, res, pool, asAttachment) {
  const { submissionId } = req.params;
  let row;
  try {
    const result = await pool.query(
      `SELECT report_json, created_at
       FROM hyrox_analyses
       WHERE submission_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [submissionId],
    );
    row = result.rows[0];
  } catch (err) {
    return res.status(500).json({ error: "db_error", message: err?.message });
  }

  const emailHtml = row?.report_json?.emailHtml;
  if (!emailHtml) {
    return res.status(404).json({ error: "not_found" });
  }

  res.set("Content-Type", "text/html");
  res.set("Cache-Control", "no-store");
  if (asAttachment) {
    res.set("Content-Disposition", `attachment; filename="hyrox-email-${submissionId}.html"`);
  }
  return res.send(emailHtml);
}

export function createAdminHyroxTestHarnessRouter(pool = defaultPool) {
  const router = express.Router();

  router.get("/hyrox/test-harness/runs", async (_req, res) => {
    try {
      return res.status(200).json(await harnessRunsPayload());
    } catch (error) {
      return res.status(500).json({ error: "test_harness_runs_failed", message: error.message });
    }
  });

  router.post("/hyrox/test-harness/email-audit/purge", async (_req, res) => {
    const retentionDays = Number(process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS);
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      return res.status(400).json({ error: "retention_not_configured" });
    }

    try {
      const result = await pool.query(
        `UPDATE hyrox_analyses
         SET report_json = NULL
         WHERE report_json IS NOT NULL
           AND created_at < NOW() - ($1 || ' days')::interval
         RETURNING id`,
        [retentionDays],
      );
      return res.status(200).json({ clearedCount: result.rowCount });
    } catch (error) {
      return res.status(500).json({ error: "email_audit_purge_failed", message: error.message });
    }
  });

  router.post("/hyrox/test-harness/metadata", async (req, res) => {
    try {
      const urls = parseRequestedUrls(req.body);
      const validation = validateUrlList(urls);
      if (!validation.ok) return res.status(validation.status).json(validation.body);
      const cacheOnly = req.body?.useCachedData === true;

      const cases = [];
      for (const url of urls) {
        try {
          const importResult = await fetchAndParseHyroxUrl(url, pool, { cacheOnly });
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
      const invalidCases = [];
      cases.forEach((entry, index) => {
        const targetValidation = validateTargetTimeInput(entry.targetTime, `case ${index + 1}`);
        if (targetValidation.ok) {
          entry.targetFinishTimeSeconds = targetValidation.seconds;
        } else {
          invalidCases.push({ entry, index, targetValidation });
        }
      });
      if (invalidCases.length) {
        const detail = invalidCases
          .map(({ entry, index }) => `case ${index + 1} — "${String(entry.targetTime ?? "").trim() || "(empty)"}"`)
          .join(", ");
        return res.status(400).json({
          error: "invalid_target_time",
          reason: detail,
          message: invalidCases.map(({ targetValidation }) => targetValidation.message).join(", "),
        });
      }

      const sharedContext = sharedContextFromRequestBody(req.body);
      const cacheOnly = req.body?.useCachedData === true;

      if (!isPack) {
        try {
          const result = await runHarnessCase({
            url: cases[0].url,
            pool,
            targetFinishTimeSeconds: cases[0].targetFinishTimeSeconds,
            sharedContext,
            label: cases[0].label,
            expectedCommentary: cases[0].expectedCommentary,
            canonical: cases[0].canonical,
            expectations: cases[0].expectations,
            cacheOnly,
          });
          const entries = [{
            url: cases[0].url,
            targetFinishTimeSeconds: cases[0].targetFinishTimeSeconds,
            label: cases[0].label,
            expectedCommentary: cases[0].expectedCommentary,
            canonical: cases[0].canonical,
            expectations: cases[0].expectations,
            result,
          }];
          const persistedRun = await persistHarnessRunSafely(entries, { isPack: false });
          applyHarnessRunHeaders(res, persistedRun);
          if (req.body?.preview === true) {
            return res.status(200).json(previewPayload({ entries, persistedRun }));
          }
          if (artifact === "email_html") {
            return sendEmailHtmlZip(res, {
              filename: artifactResponseFilename(artifact, result.parsed),
              entries,
            });
          }
          res.setHeader("Content-Type", "text/markdown; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${artifact === "qa" ? responseFilename(result.parsed) : artifactResponseFilename(artifact, result.parsed)}"`);
          return res.status(200).send(markdownWithHarnessRun(artifactMarkdown(artifact, result), persistedRun));
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
            canonical: testCase.canonical,
            expectations: testCase.expectations,
            cacheOnly,
          });
          entries.push({ url: testCase.url, targetFinishTimeSeconds: testCase.targetFinishTimeSeconds, label: testCase.label, expectedCommentary: testCase.expectedCommentary, canonical: testCase.canonical, expectations: testCase.expectations, result });
        } catch (error) {
          entries.push({ url: testCase.url, targetFinishTimeSeconds: testCase.targetFinishTimeSeconds, label: testCase.label, expectedCommentary: testCase.expectedCommentary, canonical: testCase.canonical, expectations: testCase.expectations, reason: error.reason ?? "parse_failed" });
        }
      }
      const persistedRun = await persistHarnessRunSafely(entries, { isPack: true });
      applyHarnessRunHeaders(res, persistedRun);

      if (req.body?.preview === true) {
        return res.status(200).json(previewPayload({ entries, persistedRun }));
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
      return res.status(200).send(markdownWithHarnessRun(markdown, persistedRun));
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
        lines.push(`Benchmark position: ${overallPercentileLabel ?? formatPercentileRank(overallPercentile) ?? "benchmarked"}${benchmarkGroup ? ` (${benchmarkGroup})` : ""}`);
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

      const targetValidation = validateTargetTimeInput(req.body?.targetTime, "targetTime");
      if (!targetValidation.ok) {
        return res.status(400).json({ error: "invalid_target_time", message: targetValidation.message });
      }

      const url = urls[0];
      const importResult = await fetchAndParseHyroxUrl(url, pool, { cacheOnly: req.body?.useCachedData === true });
      const analyseMode = { modeName: "Analyse", calculatorMode: "analyse", targetFinishTimeSeconds: null };
      let modeEntry;
      try {
        modeEntry = { mode: analyseMode, result: runHarnessMode(analyseMode, importResult.parsed, importResult.event, {}) };
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

  // Stored production email: preview the exact email HTML persisted with the analysis.
  router.get("/hyrox/test-harness/submission/:submissionId/email", async (req, res) => {
    return handleAdminStoredEmail(req, res, pool, false);
  });

  // Stored production email: download the exact email HTML persisted with the analysis.
  router.get("/hyrox/test-harness/submission/:submissionId/email/download", async (req, res) => {
    return handleAdminStoredEmail(req, res, pool, true);
  });

  // Race card: generate live from a URL (for test harness UI — no DB required)
  router.post("/hyrox/test-harness/race-card-url", async (req, res) => {
    const cases = parseRequestedCases(req.body);
    if (!cases.length || !cases.every((testCase) => isValidHyroxResultsUrl(testCase.url))) {
      return res.status(400).json({ error: "invalid_url" });
    }
    const cacheOnly = req.body?.useCachedData === true;

    if (cases.length === 1) {
      try {
        const { pngBuffer, parsed } = await generateRaceCardPngForCase(cases[0], pool, cacheOnly);
        res.set("Content-Type", "image/png");
        res.set("Cache-Control", "no-store");
        res.set("Content-Disposition", `attachment; filename="race-card-${nameSlug(displayAthleteName(parsed))}.png"`);
        return res.send(pngBuffer);
      } catch (error) {
        return res.status(422).json({ error: "race_card_failed", reason: error.reason ?? error.message ?? "unknown" });
      }
    }

    // Multiple cases: generate every card server-side and return one zip download —
    // looping window.open() per case in the browser gets silently popup-blocked after
    // the first tab, since only the click-adjacent call counts as user-gesture-triggered.
    const succeeded = [];
    const failed = [];
    for (const testCase of cases) {
      try {
        const { pngBuffer, parsed } = await generateRaceCardPngForCase(testCase, pool, cacheOnly);
        succeeded.push({ pngBuffer, parsed });
      } catch (error) {
        failed.push({ url: testCase.url, reason: error.reason ?? error.message ?? "unknown" });
      }
    }

    if (!succeeded.length) {
      return res.status(422).json({ error: "race_card_failed", reason: "all_cases_failed", failed });
    }

    const filename = `hyrox-race-cards-pack-${succeeded.length}-${localTimestampSlug()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    if (failed.length) {
      res.setHeader("X-Race-Cards-Failed", encodeURIComponent(JSON.stringify(failed)));
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.pipe(res);
    succeeded.forEach((entry, index) => {
      const name = `race-card-${String(index + 1).padStart(2, "0")}-${nameSlug(displayAthleteName(entry.parsed))}.png`;
      archive.append(entry.pngBuffer, { name });
    });
    await new Promise((resolve, reject) => {
      archive.on("error", reject);
      res.on("close", resolve);
      archive.finalize().catch(reject);
    });
  });

  return router;
}

export const adminHyroxTestHarnessRouter = createAdminHyroxTestHarnessRouter();

// Unauthenticated router for the browser bookmarklet cache.
// No sensitive data — only accepts valid results.hyrox.com HTML payloads.
// Mounted separately in server.js WITHOUT requireInternalToken.
export function createHyroxPageCacheRouter() {
  const router = express.Router();

  router.options("/hyrox/page-cache", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  });

  router.post("/hyrox/page-cache", express.json({ limit: "10mb" }), async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const { url, html } = req.body ?? {};
    if (!isValidHyroxResultsUrl(url) || typeof html !== "string" || html.length < 200) {
      return res.status(400).json({ error: "invalid_payload" });
    }
    const key = normaliseCacheKey(url);
    htmlCache.set(key, { html, url, cachedAt: Date.now() });
    await savePageCacheToDisk();
    return res.json({ ok: true, key, htmlLength: html.length, cachedAt: new Date().toISOString() });
  });

  router.get("/hyrox/page-cache", (req, res) => {
    const entries = [...htmlCache.entries()].map(([key, val]) => ({
      key,
      url: val.url,
      cachedAt: new Date(val.cachedAt).toISOString(),
      htmlLength: val.html.length,
    }));
    return res.json({ count: entries.length, entries });
  });

  router.delete("/hyrox/page-cache", async (req, res) => {
    const count = htmlCache.size;
    htmlCache.clear();
    await savePageCacheToDisk();
    return res.json({ ok: true, cleared: count });
  });

  return router;
}

export const hyroxPageCacheRouter = createHyroxPageCacheRouter();
