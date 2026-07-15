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

// The assets directory lives at the repo root. In Docker the api source tree is at /app and
// the assets bind-mount lands at /app/assets (3 levels up from this file). On the host the
// repo root is 4 levels up from api/src/hyrox/reports/. Try both.
function loadAssetB64(serverRelativePath) {
  if (!serverRelativePath || !serverRelativePath.startsWith("/assets/")) return null;
  const rel = serverRelativePath.slice("/assets/".length);
  for (const base of ["../../../assets", "../../../../assets"]) {
    try {
      const data = readFileSync(resolve(__dirname_carousel, base, rel));
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      // try next
    }
  }
  return null;
}

function formaMark(size) {
  const r = Math.round(size * 0.22);
  if (FORMA_LOGO_B64) {
    return `<img src="${FORMA_LOGO_B64}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:${r}px;display:block;flex-shrink:0;" />`;
  }
  return `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:#0f6fff;border-radius:${r}px;color:#fff;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:${Math.round(size * 0.5)}px;font-weight:800;line-height:1;flex-shrink:0;">F</span>`;
}

function formaBrandHeader() {
  return `<header class="forma-brand">
    ${formaMark(36)}
    <div class="forma-brand-text">
      <div class="forma-brand-name">Forma</div>
      <div class="forma-brand-sub">Performance Engineer</div>
    </div>
  </header>`;
}

const CAROUSEL_CSS = `
:root {
  --bg: #080e1a;
  --panel: #0d1422;
  --line: rgba(255, 255, 255, 0.105);
  --muted: rgba(232, 238, 248, 0.56);
  --muted-2: rgba(232, 238, 248, 0.36);
  --text: #f5f7fb;
  --blue: #08a7f5;
  --blue-dim: rgba(8, 167, 245, 0.13);
  --red: #ff4b63;
  --red-dim: rgba(255, 75, 99, 0.16);
  --font-display: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Space Mono", "Roboto Mono", "Courier New", monospace;
  --font-body: Inter, "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: #03060c; color: var(--text); font-family: var(--font-body); }
.carousel { display: grid; gap: 28px; justify-content: center; padding: 28px; }
.slide {
  width: 1080px;
  height: 1080px;
  position: relative;
  overflow: hidden;
  background: var(--bg);
  border-top: 3px solid var(--blue);
  border-bottom: 3px solid var(--blue);
  color: var(--text);
}
.forma-brand { position: absolute; top: 48px; left: 70px; display: flex; align-items: center; gap: 14px; z-index: 3; }
.forma-brand-text { line-height: 1; }
.forma-brand-name { font-family: var(--font-body); font-size: 20px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
.forma-brand-sub { font-size: 11px; font-weight: 500; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
.site { position: absolute; right: 72px; bottom: 28px; color: var(--muted); font-size: 12px; z-index: 2; }
.footer { position: absolute; left: 0; right: 0; bottom: 28px; text-align: center; color: var(--muted-2); font-size: 12px; letter-spacing: 0.03em; }
.blue { color: var(--blue); }
.danger { color: var(--red); }
.hook-copy { position: absolute; left: 70px; top: 141px; z-index: 2; }
.small-kicker { color: var(--muted); font-size: 20px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 18px; }
.hook-title { font-family: var(--font-mono); font-weight: 900; font-size: 41px; line-height: 1.13; text-transform: uppercase; margin: 0 0 38px 0; letter-spacing: -0.04em; }
.hero-number { font-family: var(--font-display); font-weight: 900; font-size: 190px; line-height: 0.9; letter-spacing: -0.06em; }
.metric-strip { position: absolute; left: 70px; right: 70px; top: 500px; display: grid; border-top: 1px solid var(--line); padding-top: 18px; z-index: 2; }
.metric-strip-4 { grid-template-columns: repeat(4, 1fr); }
.metric-item { min-height: 58px; padding: 0 14px; border-left: 1px solid var(--line); }
.metric-item:first-child { border-left: none; padding-left: 0; }
.metric-label { color: var(--muted-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 9px; }
.metric-value { font-family: var(--font-mono); font-size: 20px; font-weight: 800; text-transform: uppercase; }
.swipe-prompt { position: absolute; left: 70px; top: 594px; font-size: 18px; font-weight: 700; color: var(--text); z-index: 2; }
.athlete-image { position: absolute; right: 0; bottom: 0; width: 340px; max-height: 560px; object-fit: contain; opacity: 0.88; filter: contrast(1.12); mix-blend-mode: lighten; z-index: 1; }
.athlete-image:not([src]), .athlete-image[src=""] { display: none; }
.slide-hook::after {
  content: "";
  position: absolute;
  right: 58px;
  bottom: 70px;
  width: 235px;
  height: 390px;
  opacity: 0.18;
  background: radial-gradient(ellipse at 50% 10%, #fff 0 8%, transparent 9%),
              linear-gradient(90deg, transparent 0 37%, rgba(255,255,255,0.5) 38% 62%, transparent 63%),
              radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.4) 0 36%, transparent 37%);
  filter: blur(0.2px);
}
.slide-hook:has(.athlete-image[src]:not([src=""]))::after { display: none; }
.slide-title { font-weight: 300; text-transform: uppercase; font-size: 41px; line-height: 1.1; letter-spacing: 0.02em; text-align: center; margin: 0; }
.slide-flow .slide-title { position: absolute; top: 136px; left: 0; right: 0; }
.flow-summary { position: absolute; top: 185px; left: 80px; right: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; }
.summary-box { height: 70px; border: 1px solid; border-radius: 6px; display: grid; place-items: center; text-align: center; text-transform: uppercase; font-family: var(--font-mono); font-size: 22px; font-weight: 800; }
.summary-box.positive { border-color: var(--blue); background: var(--blue-dim); color: var(--blue); }
.summary-box.negative { border-color: var(--red); background: var(--red-dim); color: var(--red); }
.summary-label { font-family: var(--font-body); color: var(--muted-2); font-size: 10px; font-weight: 500; margin-bottom: -8px; }
.table-head { color: var(--muted); font-size: 11px; letter-spacing: 0.06em; }
.pos-head { position: absolute; top: 274px; right: 90px; }
.race-table { position: absolute; top: 300px; left: 80px; right: 80px; }
.race-row { display: grid; grid-template-columns: 1.8fr 0.8fr 0.35fr; align-items: center; height: 43px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 17px; }
.race-row .name { text-transform: uppercase; color: var(--text); }
.race-row .time { color: var(--muted); text-align: center; font-family: var(--font-mono); }
.race-row .delta { text-align: right; font-family: var(--font-mono); }
.legend { position: absolute; bottom: 58px; left: 0; right: 0; text-align: center; color: var(--muted); font-size: 12px; }
.center-stack { position: absolute; left: 120px; right: 120px; top: 210px; text-align: center; }
.kicker { color: var(--muted); font-size: 16px; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 24px; }
.kicker.secondary { margin-top: 36px; margin-bottom: 18px; }
.station-title { font-weight: 300; font-size: 58px; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 22px; }
.percentile { color: var(--blue); font-family: var(--font-mono); font-size: 26px; text-transform: uppercase; margin: 0 auto 26px; }
.regional-context { color: var(--muted); font-size: 17px; font-style: italic; line-height: 1.35; max-width: 680px; margin: -12px auto 24px; text-transform: none; }
.trophy { font-family: var(--font-body); font-size: 26px; }
.thin-rule { width: 200px; height: 1px; background: var(--line); margin: 0 auto 36px; }
.giant { font-family: var(--font-display); font-weight: 300; font-size: 190px; line-height: 0.9; letter-spacing: -0.04em; }
.subhero { font-family: var(--font-mono); font-size: 24px; text-transform: uppercase; margin-top: 18px; }
.subhero.small { font-size: 19px; line-height: 1.35; margin-top: 38px; }
.caption { color: var(--muted); font-size: 17px; line-height: 1.55; margin-top: 34px; }
.insight-wrap { position: absolute; inset: 170px 90px 90px; text-align: center; }
.two-line { font-size: 58px; line-height: 1.18; }
.short-rule { width: 198px; height: 2px; background: var(--blue); margin: 34px auto 50px; }
.insight-wrap p { font-size: 25px; line-height: 1.35; margin: 22px 0; }
.wide { width: 200px; margin: 36px auto; }
.payoff { margin-top: 34px !important; }
.top-ten { font-size: 83px; font-family: var(--font-mono); letter-spacing: 0.04em; margin-top: 22px; }
.cta-wrap { position: absolute; inset: 205px 120px 90px; text-align: center; }
.feature-list { list-style: none; margin: 0 auto 58px; padding: 0; width: 360px; text-align: left; }
.feature-list li { font-size: 24px; margin: 24px 0; }
.feature-list li::before { content: "\\2713"; color: var(--blue); display: inline-block; width: 46px; }
.cta-button { width: 480px; height: 62px; border: none; border-radius: 5px; background: var(--blue); color: #07101e; font-family: var(--font-mono); font-size: 18px; text-transform: uppercase; letter-spacing: 0.01em; }
.lower { margin: 50px auto 36px; background: var(--line); height: 1px; }
.cta-logo-row { display: flex; align-items: center; justify-content: center; gap: 14px; }
.cta-brand { font-size: 34px; letter-spacing: 0.04em; }
.cta-subtitle { color: var(--muted); font-size: 14px; margin-top: 8px; }
@media screen and (max-width: 1120px) {
  .carousel { padding: 0; gap: 12px; }
  .slide { transform-origin: top center; width: min(100vw, 1080px); height: min(100vw, 1080px); }
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
    rows.forEach(row => {
      const delta = String(row.delta ?? '');
      const deltaClass = row.tone === 'positive' ? 'blue' : row.tone === 'negative' ? 'danger' : '';
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

  // Load the hero image as base64 so it renders correctly inside the blob URL iframe,
  // where server-relative paths (/assets/...) may not resolve as expected in all browsers.
  const athleteImagePath = carouselData.slides?.[0]?.athlete_image ?? "";
  const athleteImageSrc = loadAssetB64(athleteImagePath) ?? athleteImagePath;
  const athleteImageTag = athleteImageSrc
    ? `<img class="athlete-image" alt="" src="${htmlEsc(athleteImageSrc)}" />`
    : `<img class="athlete-image" alt="" />`;

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
      ${brandHeader}
      <div class="hook-copy">
        <div class="small-kicker" data-field="slides.0.percentile">BENCHMARKED RESULT</div>
        <div class="regional-context" data-field="slides.0.regional_context" data-optional></div>
        <h1 class="hook-title">
          <span class="danger" data-field="slides.0.limiter_word">OPPORTUNITY</span>
          <span data-field="slides.0.headline_suffix">SETS THE STORY</span>
        </h1>
        <div class="hero-number blue" data-field="slides.0.hero_number">0:00</div>
      </div>
      <div class="metric-strip metric-strip-4" aria-label="Summary metrics">
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
      ${athleteImageTag}
      <div class="site" data-field="brand.site">forma.fit</div>
    </section>

    <section class="slide slide-flow" data-slide="A2_POSITION_FLOW">
      ${brandHeader}
      <h2 class="slide-title">HOW THE RACE UNFOLDED</h2>
      <div class="flow-summary">
        <div class="summary-box positive">
          <div class="summary-label">FASTEST GAP</div>
          <div><span data-field="slides.1.biggest_gain.station">-</span> <span data-field="slides.1.biggest_gain.delta">-</span></div>
        </div>
        <div class="summary-box negative">
          <div class="summary-label">BIGGEST GAP</div>
          <div><span data-field="slides.1.biggest_loss.station">-</span> <span data-field="slides.1.biggest_loss.delta">-</span></div>
        </div>
      </div>
      <div class="table-head pos-head">GAP</div>
      <div class="race-table" data-repeat="slides.1.stations"></div>
      <div class="legend"><span class="blue">BLUE</span> = FASTER THAN <span data-field="slides.1.comparison_basis">TARGET</span> &nbsp;&nbsp;&nbsp;&nbsp; <span class="danger">RED</span> = SLOWER THAN <span data-field="slides.1.comparison_basis">TARGET</span></div>
      <div class="footer">FORMA &nbsp;|&nbsp; THE PERFORMANCE ENGINEER</div>
    </section>

    <section class="slide slide-stat" data-slide="A3_BIGGEST_STRENGTH">
      ${brandHeader}
      <div class="center-stack">
        <div class="kicker">BIGGEST STRENGTH</div>
        <h2 class="station-title" data-field="slides.2.station">-</h2>
        <div class="percentile"><span class="trophy">&#127942;</span> <span data-field="slides.2.percentile">BENCHMARKED</span></div>
        <div class="thin-rule"></div>
        <div class="giant" data-field="slides.2.position_gain">-</div>
        <div class="subhero blue" data-field="slides.2.position_gain_label">TIME AHEAD OF MEDIAN</div>
        <p class="caption" data-field="slides.2.caption">This is the strongest benchmarked area in this result.</p>
      </div>
      <div class="footer">DATA SOURCE: HYROX OFFICIAL</div>
    </section>

    <section class="slide slide-stat" data-slide="A4_BIGGEST_OPPORTUNITY">
      ${brandHeader}
      <div class="center-stack opportunity-stack">
        <div class="kicker">BIGGEST OPPORTUNITY</div>
        <h2 class="station-title" data-field="slides.3.station">-</h2>
        <div class="kicker secondary">POTENTIAL GAIN</div>
        <div class="thin-rule"></div>
        <div class="giant blue" data-field="slides.3.potential_gain">0:00</div>
        <p class="caption">Improving to benchmark average could save<br><span data-field="slides.3.potential_gain_text">time.</span></p>
        <div class="subhero blue small">CURRENT STATION RANK:<br><span data-field="slides.3.current_station_rank">BENCHMARKED</span></div>
      </div>
      <div class="footer">DATA SOURCE: HYROX OFFICIAL</div>
    </section>

    <section class="slide slide-insight" data-slide="A5_KEY_INSIGHT">
      ${brandHeader}
      <div class="insight-wrap">
        <h2 class="slide-title two-line">WHAT THE<br>DATA SHOWS</h2>
        <div class="short-rule"></div>
        <p><span data-field="slides.4.athlete_first_name">Athlete</span> showed <span class="blue" data-field="slides.4.gain_text">a strong benchmark performance</span> on <span data-field="slides.4.gain_station">the strongest station</span>.</p>
        <p>There is <span class="danger" data-field="slides.4.loss_text">time potential</span> at <span data-field="slides.4.loss_station">the limiter station</span>.</p>
        <div class="thin-rule wide"></div>
        <p class="payoff">Closing this gap could move closer to</p>
        <div class="top-ten blue" data-field="slides.4.outcome_text">YOUR NEXT PB</div>
      </div>
      <div class="footer">FORMA &nbsp;|&nbsp; THE PERFORMANCE ENGINEER</div>
    </section>

    <section class="slide slide-cta" data-slide="A6_CTA">
      ${brandHeader}
      <div class="cta-wrap">
        <h2 class="slide-title two-line">DISCOVER YOUR<br>HYROX BOTTLENECK</h2>
        <div class="short-rule"></div>
        <ul class="feature-list" data-repeat="slides.5.features"></ul>
        <button class="cta-button" data-field="slides.5.button">ANALYSE MY HYROX RESULT</button>
        <div class="short-rule lower"></div>
        <div class="cta-brand" data-field="brand.product">FORMA</div>
        <div class="cta-subtitle" data-field="brand.strapline">Performance Analytics for Hybrid Athletes</div>
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
