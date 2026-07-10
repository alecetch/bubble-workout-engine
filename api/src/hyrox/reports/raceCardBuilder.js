function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function deltaToSeconds(delta) {
  const raw = String(delta ?? "0:00").replace(/^[+\-]/, "");
  const parts = raw.split(":");
  return parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(parts[0]);
}

// Split name into [line1, line2]: handles "LAST, FIRST" and "FIRST LAST"
function splitName(name) {
  const n = String(name ?? "").trim().toUpperCase();
  if (n.includes(",")) {
    const [last, first] = n.split(",").map((p) => p.trim());
    return [first || last, first ? last : ""];
  }
  const words = n.split(/\s+/);
  if (words.length <= 1) return [words[0] ?? "", ""];
  if (words.length === 2) return [words[0], words[1]];
  return [words[0], words.slice(1).join(" ")];
}

function nameFontSize(name, isDoubles) {
  const len = String(name ?? "").replace(/[^a-zA-Z]/g, "").length;
  if (isDoubles || len > 24) return 38;
  if (len > 16) return 46;
  return 54;
}

// ── SVG assets ────────────────────────────────────────────────────────────────

const FORMA_LOGO = `<svg viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" width="38" height="38">
  <rect width="38" height="38" rx="7" fill="#22d3ee"/>
  <path d="M9 9h20v5H15v4h11v4H15v7H9V9z" fill="#06111e"/>
</svg>`;

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
  <text x="124" y="98"  text-anchor="middle" fill="#64748b" font-family="'Inter Tight',Arial,sans-serif" font-weight="700" font-size="13" letter-spacing="2.5">FORMA</text>
  <text x="124" y="114" text-anchor="middle" fill="#64748b" font-family="'Inter Tight',Arial,sans-serif" font-weight="700" font-size="13" letter-spacing="2.5">SCORE</text>
  <text x="124" y="${numY.toFixed(0)}" text-anchor="middle" fill="#f0f6ff" font-family="'Inter Tight',Arial,sans-serif" font-weight="900" font-size="${numSize}">${num}</text>
  ${has ? `<text x="124" y="${(numY + 24).toFixed(0)}" text-anchor="middle" fill="#475569" font-family="Inter,Arial,sans-serif" font-weight="600" font-size="17">/100</text>` : ""}
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
  const bg = color === "#22d3ee" ? "rgba(34,211,238,0.1)" : "rgba(251,191,36,0.1)";
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" width="80" height="80" style="display:block;flex-shrink:0;">
  <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="${escapeHtml(bg)}" stroke="${escapeHtml(color)}" stroke-width="1.8"/>
  ${stationIconPaths(name, color)}
</svg>`;
}

// Station label for the chart x-axis
function stationLines(label) {
  const k = String(label ?? "").toLowerCase();
  if (/^run\s*\d*$/.test(k) || k === "run") return ["1K", "RUN"];
  if (k.includes("ski")) return ["1K", "SKIERG"];
  if (k.includes("sled push")) return ["1K", "SLED", "PUSH"];
  if (k.includes("sled pull")) return ["1K", "SLED", "PULL"];
  if (k.includes("burpee")) return ["80M", "BURPEE", "BROAD JMP"];
  if (k.includes("rowing") || k === "row" || k.includes("rowing")) return ["1K", "ROW"];
  if (k.includes("farmer")) return ["200M", "FARMERS", "CARRY"];
  if (k.includes("sandbag")) return ["100M", "SANDBAG", "LUNGES"];
  if (k.includes("wall ball")) return ["100", "WALL", "BALLS"];
  const words = String(label ?? "").toUpperCase().split(/\s+/);
  return words.slice(0, 3);
}

function buildChart(splitRows) {
  if (!splitRows || splitRows.length < 2) return "";
  const rows = splitRows.slice(0, 9);
  const n = rows.length;

  const W = 990;
  const yLW = 58;        // y-label column width
  const barW_total = W - yLW;
  const chartH = 230;    // height of bar zone
  const labelH = 82;     // station labels below
  const totalH = chartH + labelH;
  const midY = chartH / 2;  // centre line

  const maxSec = 75;
  const pxPerSec = midY / maxSec;

  const slotW = barW_total / n;
  const barW = Math.min(58, Math.floor(slotW * 0.52));

  const p = [];

  // Gridlines + y-axis labels
  for (const { s, lbl } of [
    { s: 60, lbl: "+1:00" }, { s: 30, lbl: "+0:30" }, { s: 0, lbl: "0:00" },
    { s: -30, lbl: "-0:30" }, { s: -60, lbl: "-1:00" },
  ]) {
    const y = (midY - s * pxPerSec).toFixed(1);
    const isZero = s === 0;
    p.push(`<line x1="${yLW}" y1="${y}" x2="${W}" y2="${y}" stroke="${isZero ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.09)"}" stroke-width="${isZero ? 1.5 : 0.9}"/>`);
    p.push(`<text x="${yLW - 8}" y="${(+y + 4.5).toFixed(1)}" text-anchor="end" fill="${isZero ? "#94a3b8" : "#475569"}" font-size="11" font-family="Inter,sans-serif" font-weight="500">${lbl}</text>`);
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
      p.push(`<rect x="${bx}" y="${by}" width="${barW}" height="${hPx.toFixed(1)}" fill="${color}" rx="4"/>`);
      p.push(`<text x="${mx}" y="${(midY - hPx - 8).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700" font-family="'Inter Tight',sans-serif">${disp}</text>`);
    } else {
      p.push(`<rect x="${bx}" y="${midY.toFixed(1)}" width="${barW}" height="${hPx.toFixed(1)}" fill="${color}" rx="4"/>`);
      p.push(`<text x="${mx}" y="${(midY + hPx + 17).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700" font-family="'Inter Tight',sans-serif">${disp}</text>`);
    }

    // Station label lines below
    const lines = stationLines(row.label);
    for (let li = 0; li < lines.length; li++) {
      p.push(`<text x="${mx}" y="${(chartH + 16 + li * 16).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="10" font-family="Inter,sans-serif">${lines[li]}</text>`);
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
    percentileText = null,
    formaScore   = null,
    mode         = "analyse",
    strongestStation = null,
    biggestLimiter   = null,
    splitRows    = [],
    isDoubles    = false,
  } = data ?? {};

  const [firstName, lastName] = splitName(athleteName);
  const nfs = nameFontSize(athleteName, isDoubles);
  const chart = splitRows.length >= 2 ? buildChart(splitRows) : "";
  const hasCards = strongestStation || biggestLimiter;

  // Rank ordinal for limiter stat box: "3rd percentile" → "3RD"
  const rankOrdinal = biggestLimiter?.rankText
    ? escapeHtml(biggestLimiter.rankText.replace(/ percentile$/i, "").toUpperCase())
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
.header { display: flex; align-items: center; padding: 34px 44px 26px; flex-shrink: 0; min-height: 330px; }
.h-left  { flex: 0 0 355px; display: flex; flex-direction: column; }
.h-mid   { flex: 1; display: flex; justify-content: center; align-items: center; }
.h-right { flex: 0 0 220px; display: flex; justify-content: flex-end; align-items: flex-start; padding-top: 4px; }

.logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.logo-word { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 20px; letter-spacing: 4px; color: var(--text); }

.t-hyrox { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 68px; line-height: 1; color: var(--text); letter-spacing: -1px; }
.t-perf  { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 40px; line-height: 1.1; color: var(--cyan); letter-spacing: -0.5px; }
.t-rep   { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 40px; line-height: 1.1; color: var(--cyan); letter-spacing: -0.5px; }
.tagline { margin-top: 14px; font-size: 14px; font-weight: 500; color: var(--muted); letter-spacing: 0.3px; }
.tagline .em { color: var(--cyan); font-weight: 700; }

/* ─── HORIZONTAL RULE ─── */
.hr { margin: 0 44px; height: 1px; flex-shrink: 0;
  background: linear-gradient(90deg, var(--cyan) 0%, rgba(34,211,238,0.22) 35%, transparent 72%); }

/* ─── ATHLETE STRIP ─── */
.strip { display: flex; align-items: stretch; padding: 22px 44px; flex-shrink: 0; }
.sc   { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 24px; }
.sc:first-child { padding-left: 0; }
.sc:last-child  { padding-right: 0; }
.sdiv { width: 1px; background: var(--border); flex-shrink: 0; align-self: stretch; margin: 4px 0; }

.slbl { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: var(--sub); text-transform: uppercase; margin-bottom: 3px; }
.sname { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: ${nfs}px; line-height: 1.06; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sname.cy { color: var(--cyan); }
.stime { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 54px; line-height: 1.02; color: var(--text); letter-spacing: -0.5px; }
.smeta { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; font-weight: 700; color: var(--cyan); letter-spacing: 0.2px; }
.smeta.am { color: var(--amber); }
.smeta svg { flex-shrink: 0; }

/* ─── INSIGHT CARDS ─── */
.cards { display: flex; gap: 14px; padding: 16px 44px 0; flex-shrink: 0; }
.card { flex: 1; background: var(--card); border-radius: 10px; border: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 18px 20px 16px; }
.card.cy-card { border-left: 3px solid var(--cyan); }
.card.am-card { border-left: 3px solid var(--amber); }
.card-hdr { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 12px; }
.card-hdr.cy { color: var(--cyan); } .card-hdr.am { color: var(--amber); }
.card-body { display: flex; align-items: flex-start; gap: 14px; }
.card-info { flex: 1; min-width: 0; }
.card-title { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 28px; line-height: 1.15; color: var(--text); }
.card-sub { font-size: 13px; font-weight: 500; color: var(--muted); margin-top: 4px; }
.stat-row { display: flex; gap: 10px; margin-top: 10px; }
.stat-box { flex: 1; background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px 10px; }
.stat-lbl { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; color: var(--sub); text-transform: uppercase; }
.stat-val { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 28px; line-height: 1.1; }
.stat-val.am { color: var(--amber); }
.stat-sub { font-size: 9px; font-weight: 600; letter-spacing: 1px; color: var(--sub); text-transform: uppercase; margin-top: 2px; }
.card-div { height: 1px; background: var(--border); margin: 12px 0 10px; }
.card-cta { font-size: 11px; font-weight: 700; letter-spacing: 0.4px; line-height: 1.55; text-transform: uppercase; }
.card-cta.cy { color: var(--cyan); } .card-cta.am { color: var(--amber); }
.cta-icon { display: inline-block; margin-right: 5px; vertical-align: middle; }

/* ─── SPLIT PROFILE ─── */
.splits { padding: 20px 44px 0; flex: 1; min-height: 0; overflow: hidden; }
.sp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sp-title { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 800; font-size: 16px; letter-spacing: 1px; color: var(--text); text-transform: uppercase; }
.sp-legend { display: flex; align-items: center; gap: 16px; }
.leg { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; color: var(--muted); letter-spacing: 0.3px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.bl { background: var(--blue); } .dot.rd { background: var(--neg); }

/* ─── FOOTER ─── */
.footer { padding: 16px 44px 26px; display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; border-top: 1px solid var(--border); margin-top: auto; }
.f-left { display: flex; align-items: center; gap: 10px; }
.f-brand { font-family: 'Inter Tight',Arial,sans-serif; font-weight: 900; font-size: 15px; letter-spacing: 3px; color: var(--text); }
.f-pipe { width: 1px; height: 18px; background: var(--border); }
.f-sub { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: var(--cyan); text-transform: uppercase; }
.f-right { font-family: 'Inter Tight',Arial,sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1px; color: var(--text); text-transform: uppercase; }
</style>
</head>
<body>
<div class="root">

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="h-left">
      <div class="logo-row">
        ${FORMA_LOGO}
        <span class="logo-word">FORMA</span>
      </div>
      <div class="t-hyrox">HYROX</div>
      <div class="t-perf">PERFORMANCE</div>
      <div class="t-rep">REPORT</div>
      <div class="tagline"><span class="em">YOUR RACE,</span> DECODED.</div>
    </div>
    <div class="h-mid">${scoreRingSvg(formaScore)}</div>
    <div class="h-right">${runnerSvg()}</div>
  </div>

  <div class="hr"></div>

  <!-- ── ATHLETE STRIP ── -->
  <div class="strip">
    <div class="sc">
      <div class="slbl">Athlete</div>
      <div class="sname">${escapeHtml(firstName)}</div>
      ${lastName ? `<div class="sname cy">${escapeHtml(lastName)}</div>` : ""}
    </div>
    <div class="sdiv"></div>
    <div class="sc">
      <div class="slbl">Finish Time</div>
      <div class="stime">${escapeHtml(finishTime ?? "--:--")}</div>
      ${percentileText ? `<div class="smeta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${escapeHtml(percentileText)}
      </div>` : ""}
    </div>
    <div class="sdiv"></div>
    <div class="sc">
      ${targetTime ? `
      <div class="slbl">Target Time</div>
      <div class="stime">${escapeHtml(targetTime)}</div>
      <div class="smeta am">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        YOU'VE GOT MORE IN THE TANK.
      </div>` : `
      <div class="slbl">Mode</div>
      <div class="stime" style="font-size:32px;color:var(--cyan);margin-top:4px;">ANALYSE</div>
      <div class="smeta" style="margin-top:6px;">BENCHMARK COMPARISON</div>`}
    </div>
  </div>

  <!-- ── INSIGHT CARDS ── -->
  ${hasCards ? `<div class="cards">

    ${strongestStation ? `<div class="card cy-card">
      <div class="card-hdr cy">Strongest Station</div>
      <div class="card-body">
        <div>${hexIcon(strongestStation.name, "#22d3ee")}</div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(strongestStation.name)}</div>
          ${strongestStation.percentile ? `<div class="card-sub">${escapeHtml(strongestStation.name)} — ${escapeHtml(strongestStation.percentile)}</div>` : ""}
        </div>
      </div>
      <div class="card-div"></div>
      <div class="card-cta cy">YOU POWERED THROUGH HERE.<br/>KEEP LEVERAGING THIS STRENGTH.</div>
    </div>` : ""}

    ${biggestLimiter ? `<div class="card am-card">
      <div class="card-hdr am">Biggest Limiter</div>
      <div class="card-body">
        <div>${hexIcon(biggestLimiter.name, "#fbbf24")}</div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(biggestLimiter.name)}</div>
          ${(rankOrdinal || biggestLimiter.potentialGain) ? `<div class="stat-row">
            ${rankOrdinal ? `<div class="stat-box">
              <div class="stat-lbl">Station Rank</div>
              <div class="stat-val am">${rankOrdinal}</div>
              <div class="stat-sub">Percentile</div>
            </div>` : ""}
            ${biggestLimiter.potentialGain ? `<div class="stat-box">
              <div class="stat-lbl">Potential Gain</div>
              <div class="stat-val am">${escapeHtml(biggestLimiter.potentialGain)}</div>
              <div class="stat-sub">In This Station</div>
            </div>` : ""}
          </div>` : ""}
        </div>
      </div>
      <div class="card-div"></div>
      <div class="card-cta am">
        <svg class="cta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        THIS IS WHAT HELD YOU BACK.<br/>FOCUS HERE, UNLOCK BIG TIME.
      </div>
    </div>` : ""}

  </div>` : ""}

  <!-- ── SPLIT PROFILE ── -->
  ${chart ? `<div class="splits">
    <div class="sp-head">
      <div class="sp-title">Race Split Profile</div>
      <div class="sp-legend">
        <div class="leg"><div class="dot bl"></div>FASTER THAN YOUR AVERAGE</div>
        <div class="leg"><div class="dot rd"></div>SLOWER THAN YOUR AVERAGE</div>
      </div>
    </div>
    ${chart}
  </div>` : ""}

  <!-- ── FOOTER ── -->
  <div class="footer">
    <div class="f-left">
      ${FORMA_LOGO}
      <span class="f-brand">FORMA</span>
      <div class="f-pipe"></div>
      <span class="f-sub">Data. Insight. Performance.</span>
    </div>
    <div class="f-right">Train Smarter. Race Faster.</div>
  </div>

</div>
</body>
</html>`;
}
