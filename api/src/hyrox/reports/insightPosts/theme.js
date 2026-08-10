// Shared design tokens for Forma's data-insight (editorial/population-level) Instagram posts.
//
// This intentionally duplicates — rather than imports from — the color/font/logo values already
// live in ../raceCardBuilder.js (the athlete-personal race card). That file is production code on
// a hot path (every HYROX submission); this module exists so editorial content can share its exact
// visual language (same hex values, same fonts, same logo asset, same footer convention) without
// touching or importing from raceCardBuilder.js at all, so the athlete pipeline has zero blast radius
// from this feature. If the two ever need to share code for real, that's a deliberate future refactor,
// not a byproduct of this one.
//
// Canvas size matches the brief: 1080x1350 (Instagram 4:5 portrait) — the same size the race card
// already uses, so this is not a new aspect ratio for the Forma system, just a new content type at it.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname_theme = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname_theme, "../assets");
const assetB64Cache = new Map();

function loadAssetB64(filename, mimeType) {
  const cacheKey = `${mimeType}:${filename}`;
  if (assetB64Cache.has(cacheKey)) return assetB64Cache.get(cacheKey);
  let result = "";
  try {
    const data = readFileSync(resolve(ASSETS_DIR, filename));
    result = `data:${mimeType};base64,${data.toString("base64")}`;
  } catch {
    // Missing artwork should never break generation — callers fall back to an SVG mark.
  }
  assetB64Cache.set(cacheKey, result);
  return result;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const CANVAS = Object.freeze({ width: 1080, height: 1350 });

export const SAFE_AREA = Object.freeze({
  insetX: 72,
  headerTop: 100,
  footerInsetX: 72,
  profileGridCropY: 135,
  profileGridCropSize: 1080,
  criticalContentTop: 145,
});

export const TYPOGRAPHY = Object.freeze({
  l1Headline: 56,
  l1HeadlineCompact: 50,
  l1ChartHeadline: 48,
  l1HeroStat: 172,
  l2Body: 38,
  l2BodyCompact: 36,
  l2Takeaway: 46,
  l2Caveat: 34,
  l2ChartLabel: 30,
  l2ChartSmall: 28,
  l3Footer: 24,
  l3Url: 21,
});

export const COMPOSITION = Object.freeze({
  heroShiftY: -48,
  chartShiftY: -26,
  comparisonShiftY: -24,
  meaningShiftY: -8,
  ctaShiftY: -8,
});

export const BRAND = Object.freeze({
  product: "FORMA",
  strapline: "Measure. Understand. Improve.",
  site: "www.getforma.fit",
  label: "FORMA DATA LAB",
});

// Same values as raceCardBuilder.js's :root — the canonical Forma dark/cyan/amber palette.
export const COLORS = Object.freeze({
  bg: "#06101e",
  panel: "#091525",
  card: "#0c1d2e",
  border: "rgba(255,255,255,0.08)",
  text: "#f0f6ff",
  muted: "#94a3b8",
  sub: "#475569",
  cyan: "#22d3ee",
  blue: "#3b82f6",
  amber: "#fbbf24",
  neg: "#ef4444",
  brandBlue: "#00a3f5",
});

const FORMA_MASTHEAD_ASPECT_RATIO = 401 / 70;

function formaLogoFallback(size) {
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  const iconWidth = size;
  const barHeight = Math.round(size * 0.24);
  const barGap = Math.round(size * 0.06);
  const textSize = Math.max(21, Math.round(size * 0.6));
  const textX = iconWidth + 12;
  return `<svg viewBox="0 0 ${width} ${size}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" aria-label="Forma" style="display:block;width:${width}px;height:${size}px;flex-shrink:0;">
  <polygon points="2,0 ${iconWidth},0 ${iconWidth - barHeight * 0.6},${barHeight} 2,${barHeight}" fill="#ffffff"/>
  <polygon points="2,${barHeight + barGap} ${iconWidth - barHeight * 0.35},${barHeight + barGap} ${iconWidth - barHeight * 0.95},${barHeight * 2 + barGap} 2,${barHeight * 2 + barGap}" fill="${COLORS.brandBlue}"/>
  <polygon points="2,${barHeight * 2 + barGap * 2} ${iconWidth - barHeight * 1.3},${barHeight * 2 + barGap * 2} ${iconWidth - barHeight * 1.9},${size},2,${size}" fill="#ffffff"/>
  <text x="${textX}" y="${Math.round(size * 0.72)}" font-family="'Inter Tight',Arial,sans-serif" font-size="${textSize}" font-weight="800" fill="#f8fafc">FORMA</text>
</svg>`;
}

export function formaLogoMark(size = 40) {
  const logoB64 = loadAssetB64("forma-logo.png", "image/png");
  if (!logoB64) return formaLogoFallback(size);
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  return `<img src="${logoB64}" alt="Forma" width="${width}" height="${size}" style="display:block;width:${width}px;height:${size}px;flex-shrink:0;" />`;
}

const STATION_HEX_FILES = Object.freeze({
  run: "hex-running.png",
  ski: "hex-skierg.png",
  sledPush: "hex-sled-push.png",
  sledPull: "hex-sled-pull.png",
  burpee: "hex-burpee.png",
  row: "hex-row.png",
  farmers: "hex-farmers.png",
  sandbag: "hex-sandbag.png",
  wallBalls: "hex-wall-balls.png",
});

// Simple polygon placeholder (no icon glyph) used only if a hex PNG is missing — the icon set is
// decorative accenting for ranked-bar rows, so a plain badge is an acceptable, unobtrusive fallback.
function hexBadgeFallback(color) {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" width="44" height="44" style="display:block;flex-shrink:0;">
  <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="rgba(34,211,238,0.1)" stroke="${escapeHtml(color)}" stroke-width="2"/>
</svg>`;
}

export function hexIcon(stationKey, { size = 44, color = COLORS.cyan } = {}) {
  const file = STATION_HEX_FILES[stationKey];
  const iconSrc = file ? loadAssetB64(file, "image/png") : "";
  if (!iconSrc) return hexBadgeFallback(color);
  return `<img src="${iconSrc}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;object-fit:contain;flex-shrink:0;" />`;
}

// Fonts + reset shared by every slide document. Kept identical to the race card's font stack
// (Inter / Inter Tight) so editorial posts read as typographically the same product.
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@700;800;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${CANVAS.width}px; height: ${CANVAS.height}px; background: ${COLORS.bg}; color: ${COLORS.text};
  font-family: Inter, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
.root { width: ${CANVAS.width}px; height: ${CANVAS.height}px; position: relative; display: flex; flex-direction: column;
  background: ${COLORS.bg}; overflow: hidden; }
.gutter { padding-left: ${SAFE_AREA.insetX}px; padding-right: ${SAFE_AREA.insetX}px; }

/* ── Header: logo (left) + recurring "FORMA DATA LAB" editorial kicker (right) — opposite
   corners so the kicker doesn't compete with the logo for primacy, and so the header balances
   the footer's own left/right split (sample-size left, CTA right). ── */
.dl-header { display: flex; align-items: center; justify-content: space-between; padding: ${SAFE_AREA.headerTop}px ${SAFE_AREA.insetX}px 0; flex-shrink: 0; }
.dl-kicker { font-family: 'Inter Tight', Arial, sans-serif; font-weight: 700; font-size: 21px; letter-spacing: 2px;
  color: ${COLORS.muted}; text-transform: uppercase; }

/* ── Swipe-to-continue prompt: sits just above the footer on carousel slides that have more to
   show — mirrors the existing athlete carousel's .swipe-prompt so multi-slide posts don't strand
   readers on slide 1 once they've seen the headline stat. ── */
.dl-swipe { padding: 0 ${SAFE_AREA.insetX}px 20px; display: flex; align-items: center; gap: 9px; flex-shrink: 0;
  font-size: 24px; font-weight: 700; color: ${COLORS.text}; }
.dl-swipe-arrow { color: ${COLORS.cyan}; font-weight: 900; }

/* ── Footer: dataset credibility line (left) + site/CTA (right), matches race-card footer bar ──
   Level 3 (metadata/evidence) tier — kept smaller than body copy by design, but with a floor:
   never below ~22px, since a user who deliberately looks for the sample size must be able to
   read it without zooming (mobile-readability audit, 2026-08). ── */
.dl-footer { padding: 22px ${SAFE_AREA.footerInsetX}px; display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid ${COLORS.border}; margin-top: auto; flex-shrink: 0; }
.dl-footer-note { font-size: ${TYPOGRAPHY.l3Footer}px; font-weight: 600; color: ${COLORS.muted}; letter-spacing: 0.1px; line-height: 1.32; max-width: 640px; }
.dl-footer-action { min-width: 300px; flex-shrink: 0; text-align: right; }
.dl-footer-cta { font-size: 26px; font-weight: 800; letter-spacing: 0.1px; text-align: right; white-space: nowrap; }
.dl-footer-cta.no-cta { color: ${COLORS.muted}; }
.dl-footer-cta.soft-cta { color: ${COLORS.cyan}; }
.dl-footer-cta.direct-cta { color: ${COLORS.amber}; }
.dl-footer-url { display: block; font-size: ${TYPOGRAPHY.l3Url}px; font-weight: 600; color: ${COLORS.muted}; margin-top: 3px; }

.dl-headline { font-family: 'Inter Tight', Arial, sans-serif; font-weight: 900; text-transform: uppercase;
  color: ${COLORS.text}; letter-spacing: -0.5px; line-height: 1.08; }
/* Level 2 (essential supporting copy) floor — was 26px, which read as illegible in the real
   Instagram feed at ~375-390 CSS px wide even though it looked fine at native 1080px (Post 1
   regression, 2026-08 mobile-readability audit). 26px sat below this system's own L2 minimum;
   34px is inside the approved 32-38px band. Do not drop this below 32px. ── */
.dl-body-text { font-size: ${TYPOGRAPHY.l2Body}px; font-weight: 600; color: ${COLORS.muted}; line-height: 1.34; }
.dl-rule { height: 1px; background: ${COLORS.border}; }
`;

export function slideDocument(bodyHtml, { title = "Forma HYROX Data" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ── Shared slide chrome: header + footer, identical across every component ────────────────────

export function dataLabHeader() {
  return `<div class="dl-header">${formaLogoMark(42)}<div class="dl-kicker">${escapeHtml(BRAND.label)}</div></div>`;
}

export function dataLabSwipePrompt(text) {
  if (!text) return "";
  return `<div class="dl-swipe"><span class="dl-swipe-arrow">&#8594;</span><span>${escapeHtml(text)}</span></div>`;
}

const CTA_COPY = Object.freeze({
  none: null,
  soft: "See where your race compares →",
  direct: "Analyse your HYROX free →",
});

// ctaLabel is an optional per-slide override of the default copy for its ctaType — used sparingly,
// e.g. post 1 softens "Analyse your HYROX free" to "See where your race ranks" for a launch post
// that shouldn't read as an ad. Every other post keeps the shared default for its ctaType.
export function dataLabFooter({ sampleSizeText, ctaType = "none", ctaLabel: ctaLabelOverride }) {
  const ctaClass = ctaType === "direct" ? "direct-cta" : ctaType === "soft" ? "soft-cta" : "no-cta";
  const ctaLabel = ctaLabelOverride ?? CTA_COPY[ctaType] ?? null;
  return `<div class="dl-footer">
    <div class="dl-footer-note">${escapeHtml(sampleSizeText ?? "")}</div>
    <div class="dl-footer-action">
      ${ctaLabel ? `<div class="dl-footer-cta ${ctaClass}">${escapeHtml(ctaLabel)}</div>` : ""}
      <span class="dl-footer-url">${escapeHtml(BRAND.site)}</span>
    </div>
  </div>`;
}
