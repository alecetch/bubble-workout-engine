import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname_carousel = dirname(fileURLToPath(import.meta.url));

let FORMA_LOGO_B64 = "";
for (const rel of ["./assets/forma-logo.png", "../../../../web/src/assets/forma-logo.png"]) {
  try {
    FORMA_LOGO_B64 = `data:image/png;base64,${readFileSync(resolve(__dirname_carousel, rel)).toString("base64")}`;
    break;
  } catch {
    // try next path; falls back to CSS "F" mark
  }
}

// Pre-sized to 1080x1080 (the slide's rendered dimensions) and re-encoded as JPEG so the
// data URI embedded once in <style> stays small — it's shared by all 6 slides via one CSS
// rule, not repeated per-slide the way an <img> per slide would be.
let WATERMARK_B64 = "";
try {
  WATERMARK_B64 = `data:image/jpeg;base64,${readFileSync(resolve(__dirname_carousel, "./assets/instagram-watermark.jpg")).toString("base64")}`;
} catch {
  // missing file — CSS background-image simply won't render
}

const FORMA_MASTHEAD_ASPECT_RATIO = 401 / 70;
const FORMA_BRAND_BLUE = "#00a3f5";

function formaMark(size) {
  const width = Math.round(size * FORMA_MASTHEAD_ASPECT_RATIO);
  if (FORMA_LOGO_B64) {
    return `<img src="${FORMA_LOGO_B64}" alt="Forma — Measure. Understand. Improve." width="${width}" height="${size}" style="width:${width}px;height:${size}px;display:block;flex-shrink:0;" />`;
  }
  const r = Math.round(size * 0.22);
  return `<span style="display:inline-flex;align-items:center;gap:${Math.round(size * 0.2)}px;flex-shrink:0;">
    <span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${FORMA_BRAND_BLUE};border-radius:${r}px;color:#fff;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:${Math.round(size * 0.5)}px;font-weight:800;line-height:1;">F</span>
    <span style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:${Math.round(size * 0.55)}px;font-weight:700;color:#fff;">FORMA</span>
  </span>`;
}

function formaBrandHeader() {
  return `<header class="forma-brand">
    ${formaMark(36)}
  </header>`;
}

const CAROUSEL_CSS = `
:root {
  --bg: #080e1a;
  --panel: #0d1422;
  --line: rgba(255, 255, 255, 0.14);
  --muted: rgba(232, 238, 248, 0.62);
  --muted-2: rgba(232, 238, 248, 0.44);
  --text: #f5f7fb;
  --blue: #08a7f5;
  --blue-dim: rgba(8, 167, 245, 0.13);
  --red: #ff4b63;
  --red-dim: rgba(255, 75, 99, 0.16);
  --font-display: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Space Mono", "Roboto Mono", "Courier New", monospace;
  --font-body: Inter, "Helvetica Neue", Arial, sans-serif;

  /* Social typography scale (Phase 2 of the mobile-readability review) — every generated
     carousel slide pulls sizes from here rather than a bespoke px value per rule, so a future
     "still too small at 390px" finding is a one-line token change, not a slide-by-slide hunt.
     Ranges are calibrated so nothing meaningful sits below ~24px at native 1080px render, which
     is the threshold that held up as readable-without-zooming at 360-390px feed width in testing. */
  --fs-hero: 180px;        /* single short hero value (A1 hero number) */
  --fs-hero-alt: 104px;    /* two-part hero (value + FASTER/SLOWER/AVAILABLE word), A3/A4/A5 */
  --fs-hero-word: 50px;    /* the FASTER/SLOWER/AVAILABLE word beside --fs-hero-alt */
  --fs-heading: 60px;      /* slide titles / station names */
  --fs-heading-mono: 46px; /* mono-font headline (A1 hook-title), wider glyphs than sans */
  --fs-body: 34px;         /* important body copy / captions */
  --fs-metric: 40px;       /* metric values (A1 summary grid, race-row numbers) */
  --fs-label: 28px;        /* secondary labels / kickers */
  --fs-meta: 24px;         /* dataset notes, legend, footer-adjacent metadata */
}
* { box-sizing: border-box; }
html, body { margin: 0; background: #03060c; color: var(--text); font-family: var(--font-body); }
.carousel { display: grid; gap: 28px; justify-content: center; padding: 28px; }
.slide {
  width: 1080px;
  height: 1350px;
  position: relative;
  overflow: hidden;
  background: var(--bg);
  border-top: 3px solid var(--blue);
  border-bottom: 3px solid var(--blue);
  color: var(--text);
}
.forma-brand { position: absolute; top: 48px; left: 70px; display: flex; align-items: center; z-index: 3; }
.site { position: absolute; right: 72px; bottom: 28px; color: var(--muted); font-size: var(--fs-meta); z-index: 2; }
.cta-url { color: var(--blue); font-family: var(--font-mono); font-size: var(--fs-label); letter-spacing: 0.02em; margin-top: 18px; }
.footer { position: absolute; left: 0; right: 0; bottom: 28px; text-align: center; color: var(--muted-2); font-size: var(--fs-meta); letter-spacing: 0.03em; }
.blue { color: var(--blue); }
.danger { color: var(--red); }
.purple { color: #a78bfa; }
/* Hook copy + metric grid + swipe prompt used to each carry their own hardcoded absolute
   top offset, sized for the shortest-case content (e.g. a single-line "RUN 8" best-station
   value). Real data can be longer — "NO RELIABLE STRENGTH" wraps to 2 lines in the metric grid
   — and a fixed offset below it doesn't know that happened, so it silently overlapped whatever
   came next. Flowing all three through one column instead means growth in one section pushes
   the next one down automatically, for any content length, not just the cases tested by eye. */
.slide-hook-body { position: absolute; left: 70px; right: 70px; top: 150px; bottom: 90px; z-index: 2; display: flex; flex-direction: column; }
.hook-copy { flex-shrink: 0; }
.small-kicker { color: var(--muted); font-size: var(--fs-label); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 20px; }
.hook-title { font-family: var(--font-mono); font-weight: 900; font-size: var(--fs-heading-mono); line-height: 1.15; text-transform: uppercase; margin: 0 0 40px 0; letter-spacing: -0.03em; }
.hero-number { font-family: var(--font-display); font-weight: 900; font-size: var(--fs-hero); line-height: 0.9; letter-spacing: -0.06em; }
/* 2x2 metric grid (Phase 3) — was a single cramped 4-column row; fewer, larger elements per
   cell instead of the same info packed tighter. */
.metric-strip { flex-shrink: 0; display: grid; border-top: 1px solid var(--line); padding-top: 26px; margin-top: 56px; }
.metric-strip-2x2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; row-gap: 32px; column-gap: 20px; }
.metric-item { min-height: 76px; padding: 0 24px; }
.metric-strip-2x2 .metric-item:nth-child(odd) { padding-left: 0; }
.metric-strip-2x2 .metric-item:nth-child(even) { border-left: 1px solid var(--line); }
.metric-strip-2x2 .metric-item:nth-child(3), .metric-strip-2x2 .metric-item:nth-child(4) { border-top: 1px solid var(--line); padding-top: 28px; }
.metric-label { color: var(--muted-2); font-size: var(--fs-label); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
.metric-value { font-family: var(--font-mono); font-size: var(--fs-metric); font-weight: 800; text-transform: uppercase; line-height: 1.2; }
.swipe-prompt { flex-shrink: 0; margin-top: 40px; font-size: var(--fs-label); font-weight: 700; color: var(--text); }
.watermark {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: url("${WATERMARK_B64}");
  background-size: cover;
  background-position: center;
  opacity: 0.16;
  pointer-events: none;
}
/* Cover (A1) and CTA (A6) slides carry little/no dense text, so the watermark can read
   more strongly there. Data/table slides (A2's station table, and the stat/insight
   slides in between) keep the subtle base opacity so numbers stay easy to scan. */
.slide-hook .watermark, .slide-cta .watermark { opacity: 0.28; }
.slide-title { font-weight: 400; text-transform: uppercase; font-size: var(--fs-heading); line-height: 1.15; letter-spacing: 0.02em; text-align: center; margin: 0; }
.slide-flow .slide-title { position: absolute; top: 118px; left: 0; right: 0; }
.flow-summary { position: absolute; top: 210px; left: 70px; right: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
.summary-box { height: 92px; border: 1px solid; border-radius: 8px; display: grid; place-items: center; gap: 6px; text-align: center; text-transform: uppercase; font-family: var(--font-mono); font-size: var(--fs-label); font-weight: 800; }
.summary-box.positive { border-color: var(--blue); background: var(--blue-dim); color: var(--blue); }
.summary-box.negative { border-color: var(--red); background: var(--red-dim); color: var(--red); }
.summary-label { font-family: var(--font-body); color: var(--muted-2); font-size: var(--fs-meta); font-weight: 600; }
/* Race-flow column header row — replaces a lone floating "GAP" label with all three columns
   named, so the table doesn't rely on the reader inferring what the left/middle columns are. */
.race-head { position: absolute; top: 336px; left: 70px; right: 70px; display: grid; grid-template-columns: 1.5fr 0.8fr 0.7fr; color: var(--muted-2); font-size: 19px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.race-head .time-col { text-align: center; }
.race-head .gap-col { text-align: right; }
.race-table { position: absolute; top: 378px; left: 70px; right: 70px; }
.race-row { display: grid; grid-template-columns: 1.5fr 0.8fr 0.7fr; align-items: center; height: 54px; border-bottom: 1px solid rgba(255,255,255,0.12); font-size: 27px; }
.race-row .name { text-transform: uppercase; color: var(--text); font-weight: 500; }
.race-row .time { color: var(--muted); text-align: center; font-family: var(--font-mono); font-size: 24px; }
.race-row .delta { text-align: right; font-family: var(--font-mono); font-weight: 800; font-size: 29px; }
/* The row budget below the header (top:378 to the legend) fits 16 rows at the sizes above.
   A penalty row (present whenever the athlete recorded a penalty) makes it 17 — RENDERER_JS adds
   this class when the actual row count exceeds what was sized for, rather than the table quietly
   overflowing into the legend/footer, which happened when this was still a fixed 16-row budget. */
.race-table.compact .race-row { height: 47px; font-size: 24px; }
.race-table.compact .race-row .time { font-size: 21px; }
.race-table.compact .race-row .delta { font-size: 25px; }
.legend { position: absolute; bottom: 58px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 32px; color: var(--muted); font-size: var(--fs-meta); font-weight: 600; }
.legend-item { display: inline-flex; align-items: center; gap: 10px; }
.legend-dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
.legend-dot.blue { background: var(--blue); }
.legend-dot.danger { background: var(--red); }
.center-stack { position: absolute; inset: 190px 90px 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.kicker { color: var(--muted); font-size: var(--fs-label); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 26px; }
.kicker.secondary { margin-top: 36px; margin-bottom: 18px; }
.station-title { font-weight: 400; font-size: var(--fs-heading); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 22px; }
.percentile { color: var(--blue); font-family: var(--font-mono); font-size: var(--fs-label); text-transform: uppercase; margin: 0 auto 26px; }
.regional-context { color: var(--muted); font-size: 20px; font-style: italic; line-height: 1.35; max-width: 720px; margin: -12px auto 24px; text-transform: none; }
.thin-rule { width: 220px; height: 1px; background: var(--line); margin: 0 auto 40px; }
/* Two-part social hero: a value ("40 SEC" / "1:15") plus a bold direction word (FASTER / SLOWER /
   AVAILABLE / TO FIND), replacing the old bare "+0:40" mathematical gap (Phase 5/6/13). */
.giant-phrase { display: flex; align-items: baseline; justify-content: center; gap: 20px; flex-wrap: wrap; }
.giant-value { font-family: var(--font-display); font-weight: 300; font-size: var(--fs-hero-alt); line-height: 0.9; letter-spacing: -0.03em; }
.giant-word { font-family: var(--font-mono); font-weight: 800; font-size: var(--fs-hero-word); text-transform: uppercase; letter-spacing: 0.01em; }
.subhero { font-family: var(--font-mono); font-size: var(--fs-label); text-transform: uppercase; margin-top: 22px; }
.subhero.small { font-size: var(--fs-meta); line-height: 1.4; margin-top: 30px; }
.caption { color: var(--muted); font-size: var(--fs-body); line-height: 1.5; margin-top: 36px; max-width: 820px; }
.insight-wrap { position: absolute; inset: 170px 80px 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.two-line { font-size: var(--fs-heading); line-height: 1.2; }
.short-rule { width: 210px; height: 2px; background: var(--blue); margin: 30px auto; }
.insight-pairs { display: flex; justify-content: center; gap: 56px; margin: 10px 0 20px; flex-wrap: wrap; }
.insight-pair { min-width: 260px; }
.insight-pair-label { font-family: var(--font-body); color: var(--muted-2); font-size: var(--fs-meta); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 10px; }
.insight-pair-name { font-family: 'Inter Tight', var(--font-body); font-weight: 700; font-size: 32px; text-transform: uppercase; margin-bottom: 10px; }
.insight-pair-value { display: flex; align-items: baseline; justify-content: center; gap: 10px; flex-wrap: wrap; font-family: var(--font-mono); font-weight: 800; font-size: 42px; text-transform: uppercase; }
.insight-wrap p.payoff { font-size: var(--fs-body); line-height: 1.4; margin: 18px 0 10px; color: var(--text); max-width: 760px; }
.top-ten { font-size: 68px; font-family: var(--font-mono); letter-spacing: 0.03em; margin-top: 14px; }
.cta-wrap { position: absolute; inset: 200px 110px 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.feature-list { list-style: none; margin: 0 auto 54px; padding: 0; width: 420px; text-align: left; }
.feature-list li { font-size: var(--fs-body); margin: 26px 0; }
.feature-list li::before { content: "\\2713"; color: var(--blue); display: inline-block; width: 46px; }
.cta-button { width: 520px; height: 74px; border: none; border-radius: 6px; background: var(--blue); color: #07101e; font-family: var(--font-mono); font-size: var(--fs-label); font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em; }
.lower { margin: 50px auto 36px; background: var(--line); height: 1px; }
.cta-logo-row { display: flex; align-items: center; justify-content: center; gap: 14px; }
.cta-brand { font-size: 38px; letter-spacing: 0.04em; }
.cta-subtitle { color: var(--muted); font-size: var(--fs-meta); margin-top: 8px; }
@media screen and (max-width: 1120px) {
  .carousel { padding: 0; gap: 12px; }
  .slide { transform-origin: top center; width: min(100vw, 1080px); height: calc(min(100vw, 1080px) * 1350 / 1080); }
}
.page-header { text-align: center; padding: 32px 20px 8px; font-family: Arial, sans-serif; }
.page-header h1 { color: #08a7f5; font-size: 22px; font-weight: 700; margin: 0 0 8px; letter-spacing: 0.04em; }
.page-header p { color: rgba(232,238,248,0.56); font-size: 13px; margin: 0; }
`;

const RENDERER_JS = `
(function () {
  const data = window.templateAData;
  if (!data) return;
  const get = (path, root) => {
    const r = root !== undefined ? root : data;
    return path.split('.').reduce((acc, key) => acc == null ? undefined : acc[key], r);
  };
  document.querySelectorAll('[data-field]').forEach(el => {
    const value = get(el.getAttribute('data-field'));
    if (value !== undefined && value !== null) el.textContent = value;
    else if (el.hasAttribute('data-optional')) el.style.display = 'none';
  });
  const raceTable = document.querySelector('[data-repeat="slides.1.stations"]');
  if (raceTable) {
    raceTable.innerHTML = '';
    const rows = get('slides.1.stations') || [];
    // A penalty row makes 17 rows instead of the usual 16 (8 runs + 8 stations) — the fixed
    // top-of-table-to-legend budget below the header was sized for 16, so anything beyond that
    // switches to a slightly smaller compact row style rather than overflowing into the legend.
    raceTable.classList.toggle('compact', rows.length > 16);
    rows.forEach(row => {
      const delta = String(row.delta ?? '');
      const deltaClass = row.tone === 'positive' ? 'blue' : row.tone === 'negative' ? 'danger' : row.tone === 'penalty' ? 'purple' : '';
      const item = document.createElement('div');
      item.className = 'race-row';
      item.innerHTML = '<div class="name">' + (row.name ?? '') + '</div><div class="time">' + (row.time ?? '') + '</div><div class="delta ' + deltaClass + '">' + delta + '</div>';
      raceTable.appendChild(item);
    });
  }
  const features = document.querySelector('[data-repeat="slides.5.features"]');
  if (features) {
    features.innerHTML = '';
    (get('slides.5.features') || []).forEach(feature => {
      const li = document.createElement('li');
      li.textContent = feature;
      features.appendChild(li);
    });
  }
})();
`;

function htmlEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCarouselPage(carouselData = {}) {
  const athleteName = carouselData.slides?.[0]?.athlete_name ?? "Athlete";
  const dataJson = JSON.stringify(carouselData).replace(/<\/script>/gi, "<\\/script>");
  const brandHeader = formaBrandHeader();
  const watermark = `<div class="watermark"></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HYROX Analysis — ${htmlEsc(athleteName)} | FORMA</title>
  <style>${CAROUSEL_CSS}</style>
</head>
<body>
  <div class="page-header">
    <h1>YOUR HYROX PERFORMANCE SLIDES</h1>
    <p>Screenshot each slide to share on Instagram &mdash; or use your browser&rsquo;s print / save as PDF option.</p>
  </div>
  <main id="carousel" class="carousel" aria-label="Forma athlete analysis carousel">
    <section class="slide slide-hook" data-slide="A1_ATHLETE_HOOK">
      ${watermark}
      ${brandHeader}
      <div class="slide-hook-body">
        <div class="hook-copy">
          <div class="small-kicker" data-field="slides.0.percentile">BENCHMARKED RESULT</div>
          <div class="regional-context" data-field="slides.0.regional_context" data-optional></div>
          <h1 class="hook-title">
            <span class="danger" data-field="slides.0.limiter_word">OPPORTUNITY</span>
            <span data-field="slides.0.headline_suffix">SETS THE STORY</span>
          </h1>
          <div class="hero-number blue" data-field="slides.0.hero_number">0:00</div>
        </div>
        <div class="metric-strip metric-strip-2x2" aria-label="Summary metrics">
          <div class="metric-item">
            <div class="metric-label">TIME</div>
            <div class="metric-value" data-field="slides.0.overall_time">-</div>
          </div>
          <div class="metric-item">
            <div class="metric-label" data-field="slides.0.metric2_label">WORLD RANK</div>
            <div class="metric-value" data-field="slides.0.world_rank">-</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">BEST STATION</div>
            <div class="metric-value blue" data-field="slides.0.best_station">-</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">LIMITING STATION</div>
            <div class="metric-value danger" data-field="slides.0.biggest_limiter">-</div>
          </div>
        </div>
        <div class="swipe-prompt"><span class="blue">&#8594;</span> <span data-field="slides.0.swipe_prompt">Swipe to see where time was gained and lost.</span></div>
      </div>
      <div class="site" data-field="brand.site">www.getforma.fit</div>
    </section>

    <section class="slide slide-flow" data-slide="A2_POSITION_FLOW">
      ${watermark}
      ${brandHeader}
      <h2 class="slide-title">HOW THE RACE UNFOLDED</h2>
      <div class="flow-summary">
        <div class="summary-box positive">
          <div class="summary-label">FASTEST SPLIT</div>
          <div><span data-field="slides.1.biggest_gain.station">-</span> <span data-field="slides.1.biggest_gain.delta">-</span></div>
        </div>
        <div class="summary-box negative">
          <div class="summary-label">SLOWEST SPLIT</div>
          <div><span data-field="slides.1.biggest_loss.station">-</span> <span data-field="slides.1.biggest_loss.delta">-</span></div>
        </div>
      </div>
      <div class="race-head"><span>SPLIT</span><span class="time-col">TIME</span><span class="gap-col">GAP</span></div>
      <div class="race-table" data-repeat="slides.1.stations"></div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot blue"></span>FASTER THAN <span data-field="slides.1.comparison_basis">TARGET</span></span>
        <span class="legend-item"><span class="legend-dot danger"></span>SLOWER THAN <span data-field="slides.1.comparison_basis">TARGET</span></span>
      </div>
      <div class="footer">FORMA &nbsp;|&nbsp; <span data-field="brand.site">www.getforma.fit</span></div>
    </section>

    <section class="slide slide-stat" data-slide="A3_BIGGEST_STRENGTH">
      ${watermark}
      ${brandHeader}
      <div class="center-stack">
        <div class="kicker">BIGGEST STRENGTH</div>
        <h2 class="station-title" data-field="slides.2.station">-</h2>
        <div class="percentile"><span data-field="slides.2.percentile">BENCHMARKED</span></div>
        <div class="thin-rule"></div>
        <div class="giant-phrase blue">
          <span class="giant-value" data-field="slides.2.position_gain_value">-</span>
          <span class="giant-word" data-field="slides.2.position_gain_unit" data-optional></span>
          <span class="giant-word" data-field="slides.2.position_gain_direction" data-optional></span>
        </div>
        <div class="subhero blue" data-field="slides.2.position_gain_sublabel">THAN MEDIAN</div>
        <p class="caption" data-field="slides.2.caption">This is the strongest benchmarked area in this result.</p>
      </div>
      <div class="footer">DATA SOURCE: HYROX OFFICIAL</div>
    </section>

    <section class="slide slide-stat" data-slide="A4_BIGGEST_OPPORTUNITY">
      ${watermark}
      ${brandHeader}
      <div class="center-stack opportunity-stack">
        <div class="kicker">BIGGEST OPPORTUNITY</div>
        <h2 class="station-title" data-field="slides.3.station">-</h2>
        <div class="thin-rule"></div>
        <div class="giant-phrase blue">
          <span class="giant-value" data-field="slides.3.opportunity_value">-</span>
          <span class="giant-word" data-field="slides.3.opportunity_unit" data-optional></span>
          <span class="giant-word" data-field="slides.3.opportunity_word" data-optional></span>
        </div>
        <div class="subhero blue" data-field="slides.3.opportunity_sublabel">VS MEDIAN</div>
      </div>
      <div class="footer">DATA SOURCE: HYROX OFFICIAL</div>
    </section>

    <section class="slide slide-insight" data-slide="A5_KEY_INSIGHT">
      ${watermark}
      ${brandHeader}
      <div class="insight-wrap">
        <h2 class="slide-title two-line">WHAT THE<br>DATA SHOWS</h2>
        <div class="short-rule"></div>
        <div class="insight-pairs">
          <div class="insight-pair">
            <div class="insight-pair-label">Strength</div>
            <div class="insight-pair-name" data-field="slides.4.gain_station_name">-</div>
            <div class="insight-pair-value blue">
              <span data-field="slides.4.gain_value" data-optional></span>
              <span data-field="slides.4.gain_unit" data-optional></span>
              <span data-field="slides.4.gain_direction" data-optional></span>
            </div>
          </div>
          <div class="insight-pair">
            <div class="insight-pair-label">Opportunity</div>
            <div class="insight-pair-name" data-field="slides.4.loss_station_name">-</div>
            <div class="insight-pair-value danger">
              <span data-field="slides.4.loss_value" data-optional></span>
              <span data-field="slides.4.loss_unit" data-optional></span>
              <span data-field="slides.4.loss_word" data-optional></span>
            </div>
          </div>
        </div>
        <div class="short-rule"></div>
        <p class="payoff" data-field="slides.4.insight_short">Closing this gap could move you closer to your next PB.</p>
        <div class="top-ten blue" data-field="slides.4.outcome_text">YOUR NEXT PB</div>
      </div>
      <div class="footer">FORMA &nbsp;|&nbsp; <span data-field="brand.site">www.getforma.fit</span></div>
    </section>

    <section class="slide slide-cta" data-slide="A6_CTA">
      ${watermark}
      ${brandHeader}
      <div class="cta-wrap">
        <h2 class="slide-title two-line" data-field="slides.5.headline">DISCOVER YOUR HYROX BOTTLENECK</h2>
        <div class="short-rule"></div>
        <ul class="feature-list" data-repeat="slides.5.features"></ul>
        <button class="cta-button" data-field="slides.5.button">ANALYSE MY HYROX RESULT</button>
        <div class="cta-url" data-field="brand.site">www.getforma.fit</div>
        <div class="short-rule lower"></div>
        <div class="cta-brand" data-field="brand.product">FORMA</div>
        <div class="cta-subtitle" data-field="brand.strapline">Measure. Understand. Improve.</div>
      </div>
      <div class="footer">DATA SOURCE: HYROX OFFICIAL</div>
    </section>
  </main>
  <script>window.templateAData = ${dataJson};</script>
  <script>${RENDERER_JS}</script>
</body>
</html>`;
}

export function resolveCarouselData(storedCarousel = null) {
  if (!storedCarousel || typeof storedCarousel !== "object") return null;
  if (Array.isArray(storedCarousel.slides)) return storedCarousel;
  if (storedCarousel.carousel && Array.isArray(storedCarousel.carousel.slides)) return storedCarousel.carousel;
  return null;
}
