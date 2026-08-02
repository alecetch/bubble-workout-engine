import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname_raceCard = dirname(fileURLToPath(import.meta.url));
const iconB64Cache = new Map();

function loadIconB64(filename, mimeType = "image/png") {
  if (!filename) return "";
  const cacheKey = `${mimeType}:${filename}`;
  if (iconB64Cache.has(cacheKey)) return iconB64Cache.get(cacheKey);
  let result = "";
  try {
    const data = readFileSync(resolve(__dirname_raceCard, "./assets", filename));
    result = `data:${mimeType};base64,${data.toString("base64")}`;
  } catch {
    // Missing artwork should never break race-card generation.
  }
  iconB64Cache.set(cacheKey, result);
  return result;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function deltaToSeconds(delta) {
  const raw = String(delta ?? "0:00").replace(/^[+\-]/, "");
  const parts = raw.split(":");
  return parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(parts[0]);
}

function splitPersonName(name) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!n) return { first: "", last: "" };
  if (n.includes(",")) {
    const [last, first] = n.split(",").map((p) => p.trim());
    return { first: first || last, last: first ? last : "" };
  }
  const words = n.split(/\s+/);
  if (words.length <= 1) return { first: words[0] ?? "", last: "" };
  return { first: words[0], last: words.slice(1).join(" ") };
}

function splitDoublesAthletes(name) {
  const parts = String(name ?? "")
    .split(/\s*(?:&|\+|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2).map(splitPersonName) : null;
}

function hasDoublesNameShape(name) {
  return /\s&\s/.test(String(name ?? ""));
}

function nameLines(name, isDoubles) {
  const shouldSplitDoublesName = isDoubles || hasDoublesNameShape(name);
  const doubles = shouldSplitDoublesName ? splitDoublesAthletes(name) : null;
  if (doubles) {
    return doubles.map((person) => [
      { text: person.first, tone: "white" },
      ...(person.last ? [{ text: person.last, tone: "cyan" }] : []),
    ]);
  }

  const person = splitPersonName(name);
  return [
    [{ text: person.first, tone: "white" }],
    ...(person.last ? [[{ text: person.last, tone: "cyan" }]] : []),
  ];
}

function nameFontSize(name, isDoubles, lines = null) {
  const renderedLines = lines ?? nameLines(name, isDoubles);
  const shouldUseDoublesSizing = isDoubles || hasDoublesNameShape(name);
  const longest = Math.max(
    0,
    ...renderedLines.map((line) => line.map((part) => part.text).join(" ").replace(/[^a-zA-Z]/g, "").length),
  );
  if (shouldUseDoublesSizing) {
    if (longest > 24) return 32;
    if (longest > 18) return 35;
    return 38;
  }
  if (longest > 24) return 38;
  if (longest > 16) return 46;
  return 54;
}

function renderNameLine(line) {
  return `<div class="sname">${line
    .filter((part) => part.text)
    .map((part) => `<span class="${part.tone === "cyan" ? "name-cy" : "name-wh"}">${escapeHtml(part.text)}</span>`)
    .join(" ")}</div>`;
}

// ── SVG assets ────────────────────────────────────────────────────────────────

const FORMA_MASTHEAD_ASPECT_RATIO = 401 / 70;
const FORMA_BRAND_BLUE = "#00a3f5";

function formaLogoFallback(size) {
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  const iconWidth = size;
  const barHeight = Math.round(size * 0.24);
  const barGap = Math.round(size * 0.06);
  const textSize = Math.max(21, Math.round(size * 0.6));
  const textX = iconWidth + 12;
  return `<svg viewBox="0 0 ${width} ${size}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" aria-label="Forma" style="display:block;width:${width}px;height:${size}px;flex-shrink:0;">
  <polygon points="2,0 ${iconWidth},0 ${iconWidth - barHeight * 0.6},${barHeight} 2,${barHeight}" fill="#ffffff"/>
  <polygon points="2,${barHeight + barGap} ${iconWidth - barHeight * 0.35},${barHeight + barGap} ${iconWidth - barHeight * 0.95},${barHeight * 2 + barGap} 2,${barHeight * 2 + barGap}" fill="${FORMA_BRAND_BLUE}"/>
  <polygon points="2,${barHeight * 2 + barGap * 2} ${iconWidth - barHeight * 1.3},${barHeight * 2 + barGap * 2} ${iconWidth - barHeight * 1.9},${size},2,${size}" fill="#ffffff"/>
  <text x="${textX}" y="${Math.round(size * 0.72)}" font-family="'Inter Tight',Arial,sans-serif" font-size="${textSize}" font-weight="800" fill="#f8fafc">FORMA</text>
</svg>`;
}

function formaLogoMark(size = 38) {
  const logoB64 = loadIconB64("forma-logo.png");
  if (!logoB64) return formaLogoFallback(size);
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  return `<img src="${logoB64}" alt="Forma" width="${width}" height="${size}" style="display:block;width:${width}px;height:${size}px;flex-shrink:0;" />`;
}

const STATION_ARTWORK = Object.freeze({
  run: { hexFile: "hex-running.png", simpleFile: "simple-running.png" },
  ski: { hexFile: "hex-skierg.png", simpleFile: "simple-skierg.png" },
  sledPush: { hexFile: "hex-sled-push.png", simpleFile: "simple-sled-push.png" },
  sledPull: { hexFile: "hex-sled-pull.png", simpleFile: "simple-sled-pull.png" },
  burpee: { hexFile: "hex-burpee.png", simpleFile: "simple-burpee.png" },
  row: { hexFile: "hex-row.png", simpleFile: "simple-row.png" },
  farmers: { hexFile: "hex-farmers.png", simpleFile: "simple-farmers.png" },
  sandbag: { hexFile: "hex-sandbag.png", simpleFile: "simple-sandbag.png" },
  wallBalls: { hexFile: "hex-wall-balls.png", simpleFile: "simple-wall-ball.png" },
});

function stationArtworkKey(label) {
  const k = String(label ?? "").toLowerCase().trim();
  if (!k) return null;
  if (k.includes("ski")) return "ski";
  if (k.includes("sled push")) return "sledPush";
  if (k.includes("sled pull")) return "sledPull";
  if (k.includes("burpee")) return "burpee";
  if (k.includes("row")) return "row";
  if (k.includes("farmer") || k.includes("carry")) return "farmers";
  if (k.includes("sandbag") || k.includes("lunge")) return "sandbag";
  if (k.includes("wall ball")) return "wallBalls";
  return "run";
}

function stationArtwork(label) {
  const key = stationArtworkKey(label);
  return key ? STATION_ARTWORK[key] : null;
}

function runnerSvg() {
  return `<svg viewBox="0 0 230 300" xmlns="http://www.w3.org/2000/svg" width="218" height="285" aria-hidden="true">
  <defs>
    <filter id="rgl" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <g filter="url(#rgl)" stroke="url(#rg)" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.92">
    <circle cx="140" cy="34" r="19" stroke-width="2.2"/>
    <path d="M140,53 C136,66 130,84 124,106" stroke-width="2.6"/>
    <path d="M132,72 L166,54 L178,70" stroke-width="2.2"/>
    <path d="M130,76 L104,92 L90,78" stroke-width="2" opacity="0.55"/>
    <path d="M124,106 L146,150 L124,182 L106,196" stroke-width="2.5"/>
    <path d="M124,106 L108,150 L122,182 L142,190" stroke-width="2.2" opacity="0.65"/>
    <path d="M106,196 L86,198" stroke-width="2.2" opacity="0.8"/>
    <path d="M142,190 L160,188" stroke-width="2" opacity="0.5"/>
  </g>
  <g stroke="#22d3ee" stroke-linecap="round">
    <line x1="12" y1="92"  x2="60" y2="92"  stroke-width="1.6" opacity="0.28"/>
    <line x1="6"  y1="112" x2="48" y2="112" stroke-width="1.3" opacity="0.2"/>
    <line x1="16" y1="132" x2="52" y2="132" stroke-width="1.1" opacity="0.14"/>
    <line x1="20" y1="152" x2="48" y2="152" stroke-width="0.9" opacity="0.1"/>
  </g>
  <g fill="#22d3ee">
    <circle cx="174" cy="20" r="2.2" opacity="0.5"/>
    <circle cx="190" cy="40" r="1.6" opacity="0.4"/>
    <circle cx="180" cy="58" r="2.5" opacity="0.45"/>
    <circle cx="196" cy="76" r="1.6" opacity="0.32"/>
    <circle cx="185" cy="96" r="2.2" opacity="0.42"/>
    <circle cx="198" cy="116" r="1.5" opacity="0.3"/>
    <circle cx="186" cy="134" r="2.2" opacity="0.36"/>
    <circle cx="200" cy="154" r="1.2" opacity="0.25"/>
    <circle cx="174" cy="164" r="1.8" opacity="0.32"/>
    <circle cx="192" cy="180" r="1.2" opacity="0.22"/>
    <circle cx="168" cy="192" r="2" opacity="0.3"/>
    <circle cx="178" cy="26" r="1.2" opacity="0.36"/>
    <circle cx="166" cy="46" r="1.6" opacity="0.3"/>
    <circle cx="202" cy="56" r="1" opacity="0.22"/>
  </g>
</svg>`;
}

function scoreRingSvg(formaScore) {
  const r = 92;
  const circ = 2 * Math.PI * r;
  const has = Number.isFinite(formaScore) && formaScore !== null;
  const filled = has ? (Math.max(0, Math.min(100, formaScore)) / 100) * circ : 0;
  const gap = circ - filled;
  const num = has ? String(Math.round(formaScore)) : "—";
  const numSize = has && num.length >= 3 ? 64 : 76;
  const numY = 112 + numSize * 0.78;

  return `<svg viewBox="0 0 248 248" xmlns="http://www.w3.org/2000/svg" width="248" height="248" aria-label="FORMA SCORE ${num}">
  <defs>
    <filter id="ringglow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="124" cy="124" r="${r}" fill="none" stroke="#0c1e32" stroke-width="16"/>
  ${has ? `<circle cx="124" cy="124" r="${r}" fill="none" stroke="#22d3ee" stroke-width="16"
    stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}" stroke-linecap="round"
    transform="rotate(-90 124 124)" filter="url(#ringglow)"/>` : ""}
  <text x="124" y="74"  text-anchor="middle" fill="#94a3b8" font-family="'Inter Tight',Arial,sans-serif" font-weight="700" font-size="21" letter-spacing="2">FORMA</text>
  <text x="124" y="98" text-anchor="middle" fill="#94a3b8" font-family="'Inter Tight',Arial,sans-serif" font-weight="700" font-size="21" letter-spacing="2">SCORE</text>
  <text x="124" y="${numY.toFixed(0)}" text-anchor="middle" fill="#f0f6ff" font-family="'Inter Tight',Arial,sans-serif" font-weight="900" font-size="${numSize}">${num}</text>
  ${has ? `<text x="124" y="${(numY + 28).toFixed(0)}" text-anchor="middle" fill="#94a3b8" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="21">/100</text>` : ""}
</svg>`;
}

// Station icon paths for use inside hexagons
function stationIconPaths(name, color) {
  const k = String(name ?? "").toLowerCase();
  const c = escapeHtml(color);
  const base = `stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

  if (k.includes("ski")) return `<g ${base}>
    <circle cx="40" cy="19" r="7.5" stroke-width="2.1"/>
    <line x1="40" y1="27" x2="40" y2="46"/>
    <line x1="25" y1="35" x2="40" y2="30"/><line x1="55" y1="35" x2="40" y2="30"/>
    <line x1="34" y1="46" x2="27" y2="62"/><line x1="46" y1="46" x2="53" y2="62"/>
  </g>`;

  if (k.includes("sandbag") || k.includes("lunge")) return `<g ${base}>
    <circle cx="40" cy="17" r="7.5" stroke-width="2.1"/>
    <rect x="25" y="23" width="30" height="9" rx="3"/>
    <line x1="40" y1="32" x2="40" y2="50"/>
    <path d="M40,50 L25,68 L17,68"/>
    <path d="M40,50 L57,62 L63,62"/>
  </g>`;

  if (k.includes("sled push")) return `<g ${base}>
    <circle cx="34" cy="17" r="7" stroke-width="2"/>
    <line x1="34" y1="24" x2="34" y2="44"/>
    <line x1="26" y1="34" x2="34" y2="30"/><line x1="42" y1="34" x2="34" y2="30"/>
    <path d="M34,44 L48,44 L60,52"/><path d="M48,44 L48,64"/><path d="M58,44 L58,64"/>
    <path d="M34,44 L26,60"/>
  </g>`;

  if (k.includes("sled pull")) return `<g ${base}>
    <circle cx="48" cy="17" r="7" stroke-width="2"/>
    <line x1="48" y1="24" x2="48" y2="44"/>
    <line x1="30" y1="36" x2="48" y2="30"/>
    <path d="M12,42 L26,42 L26,60"/><path d="M16,60" /><path d="M22,60"/>
    <path d="M48,44 L38,62"/><path d="M48,44 L58,62"/>
  </g>`;

  if (k.includes("burpee")) return `<g ${base}>
    <circle cx="40" cy="15" r="7.5" stroke-width="2.1"/>
    <path d="M40,22 L34,42 L20,54"/>
    <path d="M40,22 L46,42 L60,54"/>
    <line x1="26" y1="33" x2="40" y2="28"/><line x1="54" y1="33" x2="40" y2="28"/>
  </g>`;

  if (k.includes("row")) return `<g ${base}>
    <circle cx="40" cy="17" r="7.5" stroke-width="2.1"/>
    <path d="M40,25 L40,44"/>
    <line x1="26" y1="34" x2="40" y2="30"/><line x1="54" y1="34" x2="40" y2="30"/>
    <path d="M40,44 L30,58 L22,58"/>
    <path d="M40,44 L50,58 L58,58"/>
  </g>`;

  if (k.includes("farmer") || k.includes("carry")) return `<g ${base}>
    <circle cx="40" cy="15" r="7.5" stroke-width="2.1"/>
    <line x1="40" y1="23" x2="40" y2="44"/>
    <line x1="24" y1="32" x2="40" y2="27"/><line x1="56" y1="32" x2="40" y2="27"/>
    <rect x="16" y="30" width="11" height="18" rx="2.5"/>
    <rect x="53" y="30" width="11" height="18" rx="2.5"/>
    <path d="M40,44 L30,64"/><path d="M40,44 L50,64"/>
  </g>`;

  if (k.includes("wall ball")) return `<g ${base}>
    <circle cx="40" cy="19" r="9" stroke-width="2.3"/>
    <circle cx="40" cy="42" r="6.5" stroke-width="2"/>
    <line x1="40" y1="49" x2="40" y2="62"/>
    <line x1="32" y1="54" x2="40" y2="50"/><line x1="48" y1="54" x2="40" y2="50"/>
    <path d="M40,62 L30,72"/><path d="M40,62 L50,72"/>
  </g>`;

  // generic running figure fallback
  return `<g ${base}>
    <circle cx="40" cy="17" r="7.5" stroke-width="2.1"/>
    <path d="M40,25 L40,44"/>
    <line x1="27" y1="34" x2="40" y2="29"/><line x1="53" y1="34" x2="40" y2="29"/>
    <path d="M40,44 L29,62 L22,62"/>
    <path d="M40,44 L51,62 L58,62"/>
  </g>`;
}

function hexIcon(name, color) {
  const artwork = stationArtwork(name);
  const iconSrc = loadIconB64(artwork?.hexFile);
  if (iconSrc) {
    return `<img src="${iconSrc}" width="80" height="80" alt="" style="display:block;width:80px;height:80px;object-fit:contain;flex-shrink:0;" />`;
  }

  const bg = color === "#22d3ee" ? "rgba(34,211,238,0.1)" : "rgba(251,191,36,0.1)";
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" width="80" height="80" style="display:block;flex-shrink:0;">
  <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="${escapeHtml(bg)}" stroke="${escapeHtml(color)}" stroke-width="1.8"/>
  ${stationIconPaths(name, color)}
</svg>`;
}

function headerHeroImage() {
  const heroSrc = loadIconB64("hero-race-end.jpg", "image/jpeg");
  if (!heroSrc) return runnerSvg();
  return `<div style="position:relative;width:220px;height:300px;border-radius:16px;overflow:hidden;border:1px solid var(--border);">
    <img src="${heroSrc}" width="220" height="300" alt="" style="display:block;width:220px;height:300px;object-fit:cover;border-radius:16px;" />
    <div style="position:absolute;left:0;right:0;bottom:0;height:108px;background:linear-gradient(180deg,rgba(6,16,30,0) 0%,var(--bg) 100%);"></div>
  </div>`;
}

const LABEL_ROTATION_DEGREES = -90;

// Presentation-only abbreviations for split names that don't comfortably fit the
// chart's rotated single-line label slot at the card-wide 21px floor. Keyed by the
// stable segmentKey (not the label string) since every split row carries `key`.
// Does not touch SEGMENT_MAP, segmentKey values, or any analytics/benchmark logic.
const RACE_CARD_SPLIT_LABELS = Object.freeze({
  burpee_broad_jump: "BBJ",
  sandbag_lunges: "SB LUNGE",
  farmers_carry: "F. CARRY",
  wall_balls: "W BALLS",
});

function stationLabelText(key, label) {
  const mapped = key ? RACE_CARD_SPLIT_LABELS[key] : null;
  if (mapped) return mapped;
  const words = String(label ?? "").toUpperCase().split(/\s+/);
  return words.slice(0, 3).join(" ") || "SPLIT";
}

// Formats a signed seconds value as an axis-gridline label, e.g. 90 -> "+1:30", -30 -> "-0:30", 0 -> "0:00".
function formatAxisLabel(sec) {
  if (sec === 0) return "0:00";
  const sign = sec > 0 ? "+" : "-";
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

function sortedSplitRows(splitRows) {
  return (splitRows ?? [])
    .slice(0, 16)
    .map((row, index) => ({ ...row, fallbackRaceOrder: index + 1 }))
    .sort((a, b) => {
      const ar = Number.isFinite(Number(a.raceOrder)) ? Number(a.raceOrder) : a.fallbackRaceOrder;
      const br = Number.isFinite(Number(b.raceOrder)) ? Number(b.raceOrder) : b.fallbackRaceOrder;
      return ar - br;
    });
}

function buildChart(splitRows) {
  if (!splitRows || splitRows.length < 2) return "";
  const rows = sortedSplitRows(splitRows);
  const n = rows.length;
  const compact = n > 12;

  const W = 990;
  const yLW = 58;        // y-label column width
  const barW_total = W - yLW;
  const chartH = 230;    // height of bar zone
  const labelH = 205;    // rotated split-name + time zone below (fixed — do not grow, see labelStartY note)
  const totalH = chartH + labelH;
  const midY = chartH / 2;  // centre line
  // Value-label clamp bounds: never let a variance label render within this many px of the
  // chart's own top/bottom edge, independent of the (already height-capped) bar height.
  const valueLabelEdgeClearance = 16;

  // Auto-scale the axis to the actual data, snapped to 30s steps, instead of a fixed
  // ±1:00 range — a fixed range either wastes vertical room on small gaps or clips/collides
  // with the rotated split labels below when a gap exceeds it (e.g. a 100s+ limiter).
  const maxAbsSec = rows.reduce((acc, row) => Math.max(acc, Math.abs(deltaToSeconds(row.delta))), 0);
  const SCALE_STEP_SEC = 30;
  const scaleMax = Math.max(SCALE_STEP_SEC, Math.ceil(maxAbsSec / SCALE_STEP_SEC) * SCALE_STEP_SEC);
  const maxSec = scaleMax * 1.25; // headroom so the tallest bar and its top gridline don't touch the canvas edge
  const pxPerSec = midY / maxSec;

  const slotW = barW_total / n;
  const barW = Math.min(compact ? 34 : 58, Math.floor(slotW * 0.52));
  const valueFont = 21;
  const labelFont = 21;
  const labelStartY = chartH + 112;
  const timeY = chartH + 195;

  const p = [];

  // Gridlines + y-axis labels — always 5 lines (max, half, 0, -half, -max) so the axis
  // never gets crowded, with the max snapped to the auto-scaled value above.
  for (const s of [scaleMax, scaleMax / 2, 0, -scaleMax / 2, -scaleMax]) {
    const lbl = formatAxisLabel(Math.round(s));
    const y = (midY - s * pxPerSec).toFixed(1);
    const isZero = s === 0;
    p.push(`<line x1="${yLW}" y1="${y}" x2="${W}" y2="${y}" stroke="${isZero ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.09)"}" stroke-width="${isZero ? 1.5 : 0.9}"/>`);
    p.push(`<text x="${yLW - 8}" y="${(+y + 7.2).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="21" font-family="Inter,sans-serif" font-weight="700">${lbl}</text>`);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sec = deltaToSeconds(row.delta);
    const isFast = row.tone === "positive";
    const color = isFast ? "#3b82f6" : row.tone === "neutral" ? "#64748b" : "#ef4444";
    const hPx = Math.min(midY - 4, sec * pxPerSec);
    const slotX = yLW + i * slotW;
    const bx = (slotX + (slotW - barW) / 2).toFixed(1);
    const mx = (slotX + slotW / 2).toFixed(1);

    // Flip sign for display (fast = "+", slow = "-")
    const mag = String(row.delta ?? "0:00").replace(/^[+\-]/, "");
    const disp = (isFast ? "+" : row.tone === "neutral" ? "" : "-") + mag;

    if (isFast) {
      const by = (midY - hPx).toFixed(1);
      // Clamp: an extreme (near-cap) gap would otherwise push this label off the top of the
      // SVG canvas (negative y), into the ~12px gap below the .sp-head title/legend row.
      const rawDeltaY = midY - hPx - 14;
      const deltaY = Math.max(rawDeltaY, valueLabelEdgeClearance);
      // At the chart's height cap, the bar's own top edge sits only ~4px below the canvas top —
      // there's no on-canvas position left above it, so a clamped label ends up sitting over the
      // top of its own (same-color) bar. A background-color halo keeps the digits legible either way.
      const clamped = deltaY !== rawDeltaY;
      const haloAttrs = clamped ? ` stroke="#06101e" stroke-width="4" stroke-linejoin="round" paint-order="stroke"` : "";
      p.push(`<rect data-split-bar="${escapeHtml(row.key ?? row.label)}" data-split-mx="${mx}" x="${bx}" y="${by}" width="${barW}" height="${hPx.toFixed(1)}" fill="${color}" rx="4"/>`);
      p.push(`<text data-split-delta="${escapeHtml(row.key ?? row.label)}" x="${mx}" y="${deltaY.toFixed(1)}" text-anchor="middle" fill="${color}"${haloAttrs} font-size="${valueFont}" font-weight="800" font-family="'Inter Tight',sans-serif">${disp}</text>`);
    } else {
      // Symmetric floor/ceiling for the bottom edge — not currently reachable at the bar's own
      // capped height, but keeps the label on-canvas independent of any future height change.
      const rawDeltaY = midY + hPx + 26;
      const deltaY = Math.min(rawDeltaY, totalH - valueLabelEdgeClearance);
      const haloAttrs = deltaY !== rawDeltaY ? ` stroke="#06101e" stroke-width="4" stroke-linejoin="round" paint-order="stroke"` : "";
      p.push(`<rect data-split-bar="${escapeHtml(row.key ?? row.label)}" data-split-mx="${mx}" x="${bx}" y="${midY.toFixed(1)}" width="${barW}" height="${hPx.toFixed(1)}" fill="${color}" rx="4"/>`);
      p.push(`<text data-split-delta="${escapeHtml(row.key ?? row.label)}" x="${mx}" y="${deltaY.toFixed(1)}" text-anchor="middle" fill="${color}"${haloAttrs} font-size="${valueFont}" font-weight="800" font-family="'Inter Tight',sans-serif">${disp}</text>`);
    }

    p.push(`<line x1="${slotX.toFixed(1)}" y1="${chartH + 6}" x2="${slotX.toFixed(1)}" y2="${totalH - 10}" stroke="rgba(255,255,255,0.055)" stroke-width="0.8"/>`);

    const labelText = stationLabelText(row.key, row.label);
    const labelCenterCompensation = labelFont * 0.34;
    const labelX = Number(mx) + labelCenterCompensation;
    p.push(`<text data-split-label="${escapeHtml(row.key ?? row.label)}" data-split-full-label="${escapeHtml(row.label ?? "")}" x="${labelX.toFixed(1)}" y="${labelStartY.toFixed(1)}" text-anchor="start" fill="#94a3b8" font-size="${labelFont}" font-weight="800" font-family="'Inter Tight',sans-serif" letter-spacing="0.4" transform="rotate(${LABEL_ROTATION_DEGREES} ${labelX.toFixed(1)} ${labelStartY.toFixed(1)})">${escapeHtml(labelText)}</text>`);
    if (row.userTime) {
      const timeX = Number(mx) + (compact ? 7.5 : 8.2);
      const timeText = row.isPenaltyAdjusted ? `${row.userTime}*` : row.userTime;
      p.push(`<text data-split-time="${escapeHtml(row.key ?? row.label)}" data-split-raw-time="${escapeHtml(row.rawUserTime ?? "")}" x="${timeX.toFixed(1)}" y="${timeY.toFixed(1)}" text-anchor="start" fill="#f0f6ff" font-size="24" font-weight="900" font-family="'Inter Tight',sans-serif" style="font-variant-numeric: tabular-nums;" transform="rotate(${LABEL_ROTATION_DEGREES} ${timeX.toFixed(1)} ${timeY.toFixed(1)})">${escapeHtml(timeText)}</text>`);
    }
  }

  return `<svg viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}"
  xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
  ${p.join("\n  ")}
</svg>`;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildRaceCardHtml(data) {
  const {
    athleteName = "HYROX Athlete",
	    finishTime   = "--:--",
	    targetTime   = null,
    targetGapFormatted = null,
    targetGapSigned = null,
    targetGapTone = null,
	    percentileText = null,
    confidenceQualifier = null,
    formaScore   = null,
    mode         = "analyse",
    comparisonBasis = mode === "target" ? "TARGET" : "MEDIAN",
    comparisonProfileLabel = null,
    strongestStation = null,
    biggestLimiter   = null,
    fastestControllableWin = null,
    largestFitnessLimiter = null,
    penaltySummary = null,
    splitRows    = [],
    isDoubles    = false,
  } = data ?? {};

  const athleteNameLines = nameLines(athleteName, isDoubles);
  const nfs = nameFontSize(athleteName, isDoubles, athleteNameLines);
  const chart = splitRows.length >= 2 ? buildChart(splitRows) : "";
  const hasPenaltyAdjustedSplitRows = splitRows.some((row) => row?.isPenaltyAdjusted);
  const hasCards = strongestStation || biggestLimiter;
  const basisLabel = escapeHtml(comparisonBasis || (mode === "target" ? "TARGET" : "MEDIAN"));
  const splitProfileBasisLabel = escapeHtml(comparisonProfileLabel || comparisonBasis || (mode === "target" ? "TARGET" : "MEDIAN"));
  const modeTitle = mode === "target" ? "TARGET" : "ANALYSE";
	  const modeSubtitle = comparisonBasis === "TARGET BENCHMARK"
    ? "TARGET BENCHMARK"
    : comparisonBasis === "TARGET"
    ? "TARGET COMPARISON"
    : "BENCHMARK MEDIAN";
	  const percentileDisplay = percentileText && confidenceQualifier
	    ? `${percentileText} (${confidenceQualifier})`
	    : percentileText;
  const targetGapMeta = targetGapFormatted
    ? targetGapTone === "positive"
      ? `AHEAD BY ${targetGapFormatted}`
      : targetGapTone === "neutral"
        ? "ON TARGET"
        : `${targetGapSigned ?? targetGapFormatted} TO TARGET`
    : "YOU'VE GOT MORE IN THE TANK.";

  const secondaryPenaltyLine = fastestControllableWin
    && !biggestLimiter?.isPenalty
    && fastestControllableWin.name
    ? `FASTEST WIN: ${escapeHtml(fastestControllableWin.name.toUpperCase())}${fastestControllableWin.potentialGain ? ` ${escapeHtml(fastestControllableWin.potentialGain)}` : ""}`
    : null;
  const secondaryFitnessLine = biggestLimiter?.isPenalty && largestFitnessLimiter?.name
    ? `FITNESS LIMITER: ${escapeHtml(largestFitnessLimiter.name.toUpperCase())}${largestFitnessLimiter.rankText ? ` ${escapeHtml(largestFitnessLimiter.rankText.toUpperCase())}` : ""}`
    : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@700;800;900&display=swap');

:root {
  --bg:     #06101e;
  --panel:  #091525;
  --card:   #0c1d2e;
  --border: rgba(255,255,255,0.08);
  --text:   #f0f6ff;
  --muted:  #94a3b8;
  --sub:    #475569;
  --cyan:   #22d3ee;
  --blue:   #3b82f6;
  --amber:  #fbbf24;
  --neg:    #ef4444;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1080px; min-height: 1350px; background: var(--bg); color: var(--text);
  font-family: Inter,'Helvetica Neue',Arial,sans-serif; -webkit-font-smoothing: antialiased; }

.root { width: 1080px; height: 1350px; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }

/* ─── HEADER ─── */
.header  { display: flex; align-items: center; padding: 20px 44px 18px; flex-shrink: 0; min-height: 286px; }
.h-left  { flex: 0 0 400px; display: flex; flex-direction: column; }
.h-mode  { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;
  padding: 0 26px; margin: 0 4px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
.h-score { flex: 0 0 260px; display: flex; justify-content: center; align-items: center; }

.logo-row { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }

.t-hyrox { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 68px; line-height: 1; color: var(--text); letter-spacing: -1px; }
.t-perf  { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 40px; line-height: 1.1; color: var(--cyan); letter-spacing: -0.5px; }
.t-rep   { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 40px; line-height: 1.1; color: var(--cyan); letter-spacing: -0.5px; }

/* ─── HORIZONTAL RULE ─── */
.hr { margin: 0 44px; height: 1px; flex-shrink: 0;
  background: linear-gradient(90deg, var(--cyan) 0%, rgba(34,211,238,0.22) 35%, transparent 72%); }

/* ─── ATHLETE STRIP ─── */
.strip { display: flex; align-items: stretch; padding: 14px 44px; flex-shrink: 0; }
.sc   { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 24px; }
.sc:first-child { padding-left: 0; }
.sc:last-child  { padding-right: 0; }
.sdiv { width: 1px; background: var(--border); flex-shrink: 0; align-self: stretch; margin: 4px 0; }

.slbl { font-size: 21px; font-weight: 700; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
.sname { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: ${nfs}px; line-height: 1.06; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name-wh { color: var(--text); }
.name-cy { color: var(--cyan); }
.stime { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 54px; line-height: 1.02; color: var(--text); letter-spacing: -0.5px; }
.h-stime { font-size: 46px; }
.smeta { display: flex; align-items: center; gap: 7px; margin-top: 6px; font-size: 21px; font-weight: 700; color: var(--cyan); letter-spacing: 0.1px; line-height: 1.12; }
.smeta.am { color: var(--amber); }
.smeta svg { flex-shrink: 0; }

/* ─── INSIGHT CARDS ─── */
.cards { display: flex; gap: 14px; padding: 12px 44px 0; flex-shrink: 0; }
.card { flex: 1; background: var(--card); border-radius: 10px; border: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 15px 18px 14px; }
.card.cy-card { border-left: 3px solid var(--cyan); }
.card.am-card { border-left: 3px solid var(--amber); }
.card-hdr { font-size: 21px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
.card-hdr.cy { color: var(--cyan); } .card-hdr.am { color: var(--amber); }
.card-body { display: flex; align-items: flex-start; gap: 14px; }
.card-info { flex: 1; min-width: 0; }
.card-title { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 28px; line-height: 1.15; color: var(--text); }
.card-sub { font-size: 21px; font-weight: 500; color: var(--muted); margin-top: 3px; line-height: 1.12; }
.stat-row { display: flex; gap: 10px; margin-top: 8px; }
.stat-box { flex: 1; background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px 10px; }
.stat-lbl { font-size: 21px; font-weight: 700; letter-spacing: 0.2px; color: var(--muted); text-transform: uppercase; line-height: 1.02; }
.stat-val { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 28px; line-height: 1.1; }
.stat-val.am { color: var(--amber); }
.card-div { height: 1px; background: var(--border); margin: 10px 0 8px; }
.card-cta { font-size: 21px; font-weight: 700; letter-spacing: 0.1px; line-height: 1.18; text-transform: uppercase; }
.card-cta.cy { color: var(--cyan); } .card-cta.am { color: var(--amber); }
.cta-icon { display: inline-block; margin-right: 5px; vertical-align: middle; }

/* ─── SPLIT PROFILE ─── */
.splits { padding: 16px 44px 0; flex: 1; min-height: 0; overflow: hidden; }
.sp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.sp-title { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 21px; letter-spacing: 1px; color: var(--text); text-transform: uppercase; }
.sp-legend { display: flex; align-items: center; gap: 16px; }
.leg { display: flex; align-items: center; gap: 7px; font-size: 21px; font-weight: 800; color: var(--muted); letter-spacing: 0.2px; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.dot.bl { background: var(--blue); } .dot.rd { background: var(--neg); }

/* ─── FOOTER ─── */
.footer { padding: 16px 44px; display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; border-top: 1px solid var(--border); margin-top: auto; }
.f-left { display: flex; align-items: center; gap: 10px; }
.f-right { font-size: 21px; font-weight: 700; letter-spacing: 0.2px; color: var(--muted); }
</style>
</head>
<body>
<div class="root">

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="h-left">
      <div class="logo-row">
        ${formaLogoMark(57)}
      </div>
      <div class="t-hyrox">HYROX</div>
      <div class="t-perf">PERFORMANCE</div>
      <div class="t-rep">REPORT</div>
    </div>
    <div class="h-mode">
      ${targetTime ? `
	      <div class="slbl">Target Time</div>
	      <div class="stime h-stime">${escapeHtml(targetTime)}</div>
	      <div class="smeta ${targetGapTone === "positive" ? "" : "am"}">
	        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
	        ${escapeHtml(targetGapMeta)}
	      </div>` : `
      <div class="slbl">Mode</div>
      <div class="stime h-stime" style="font-size:32px;color:var(--cyan);margin-top:4px;">${modeTitle}</div>
      <div class="smeta" style="margin-top:6px;">${escapeHtml(modeSubtitle)}</div>`}
    </div>
    <div class="h-score">${scoreRingSvg(formaScore)}</div>
  </div>

  <div class="hr"></div>

  <!-- ── ATHLETE STRIP ── -->
  <div class="strip">
    <div class="sc">
	      <div class="slbl">Athlete</div>
	      ${athleteNameLines.map(renderNameLine).join("")}
	    </div>
    <div class="sdiv"></div>
    <div class="sc">
      <div class="slbl">Finish Time</div>
      <div class="stime">${escapeHtml(finishTime ?? "--:--")}</div>
	      ${percentileDisplay ? `<div class="smeta">
	        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
	        ${escapeHtml(percentileDisplay)}
	      </div>` : ""}
	      ${penaltySummary ? `<div class="smeta am">
	        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
	        PENALTIES: ${escapeHtml(penaltySummary.value)}
	          </div>` : ""}
	          ${secondaryPenaltyLine || secondaryFitnessLine ? `<div class="card-sub">${secondaryPenaltyLine ?? secondaryFitnessLine}</div>` : ""}
	        </div>
  </div>

  <!-- ── INSIGHT CARDS ── -->
  ${hasCards ? `<div class="cards">

    ${strongestStation ? `<div class="card cy-card">
	      <div class="card-hdr cy">${escapeHtml(strongestStation.cardHeader ?? "Strongest Station")}</div>
      <div class="card-body">
        <div>${hexIcon(strongestStation.name, "#22d3ee")}</div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(strongestStation.name)}</div>
          ${strongestStation.percentile ? `<div class="card-sub">${escapeHtml(strongestStation.percentile)}</div>` : ""}
        </div>
      </div>
      <div class="card-div"></div>
	      <div class="card-cta cy">${escapeHtml(strongestStation.policyStatus === "fastest_ahead_split_only" ? "PROTECT THIS RELATIVE EDGE." : "KEEP LEVERAGING THIS STRENGTH.")}</div>
    </div>` : ""}

    ${biggestLimiter ? `<div class="card am-card">
	      <div class="card-hdr am">${escapeHtml(biggestLimiter.cardHeader ?? (biggestLimiter.isPenalty ? "Biggest Opportunity" : "Biggest Limiter"))}</div>
      <div class="card-body">
        <div>${hexIcon(biggestLimiter.name, "#fbbf24")}</div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(biggestLimiter.name)}</div>
	          ${biggestLimiter.potentialGain ? `<div class="stat-row">
	            <div class="stat-box">
	              <div class="stat-lbl">${biggestLimiter.isPenalty ? "Fastest Win" : "Potential Gain"}</div>
	              <div class="stat-val am">Up to ${escapeHtml(biggestLimiter.potentialGain)}</div>
	            </div>
          </div>` : ""}
        </div>
      </div>
      <div class="card-div"></div>
      <div class="card-cta am">
        <svg class="cta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
		        ${biggestLimiter.isPenalty ? "RECLAIM THIS TIME FIRST." : biggestLimiter.actionText ? escapeHtml(biggestLimiter.actionText) : "FOCUS HERE TO UNLOCK BIG TIME."}
	      </div>
    </div>` : ""}

  </div>` : ""}

  <!-- ── SPLIT PROFILE ── -->
  ${chart ? `<div class="splits">
    <div class="sp-head">
      <div class="sp-title">Race Split Profile &mdash; VS ${splitProfileBasisLabel}</div>
      <div class="sp-legend">
        <div class="leg"><div class="dot bl"></div>FASTER</div>
        <div class="leg"><div class="dot rd"></div>SLOWER</div>
      </div>
    </div>
    ${chart}
    ${hasPenaltyAdjustedSplitRows ? `<div style="font-size:21px;font-weight:700;color:#8b5cf6;margin-top:4px;">* Penalty-adjusted performance time shown; raw split time includes recorded penalty.</div>` : ""}
  </div>` : ""}

  <!-- ── FOOTER ── -->
  <div class="footer">
	    <div class="f-left"></div>
	    <div class="f-right">www.getforma.fit</div>
	  </div>

</div>
</body>
</html>`;
}
