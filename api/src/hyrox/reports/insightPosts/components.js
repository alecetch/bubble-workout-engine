// Reusable slide-layout components for Forma data-insight posts.
//
// Every component returns a full `.root` HTML fragment (header + content + footer) ready to be
// wrapped by theme.js's slideDocument() and screenshotted at 1080x1350. Keeping the 8 layouts here
// as small, composable functions (rather than one bespoke template per post) is the point of
// Phase 13 in the brief: structured insight data -> a small template library -> rendered asset,
// not 16 hand-coded one-off pages.

import { COLORS, COMPOSITION, TYPOGRAPHY, escapeHtml, dataLabHeader, dataLabFooter, dataLabSwipePrompt } from "./theme.js";

function shell(contentHtml, { sampleSizeText, ctaType, swipePrompt, ctaLabel }) {
  return `<div class="root">
    ${dataLabHeader()}
    ${contentHtml}
    ${dataLabSwipePrompt(swipePrompt)}
    ${dataLabFooter({ sampleSizeText, ctaType, ctaLabel })}
  </div>`;
}

function kickerLabel(text) {
  if (!text) return "";
  return `<div style="font-size:${TYPOGRAPHY.l2ChartLabel}px;font-weight:800;letter-spacing:1.5px;color:${COLORS.cyan};text-transform:uppercase;margin-bottom:18px;">${escapeHtml(text)}</div>`;
}

const TONE_COLOR = Object.freeze({
  positive: COLORS.cyan,
  negative: COLORS.neg,
  neutral: COLORS.muted,
  amber: COLORS.amber,
});

// ── 1. InsightHero — big headline + one dominant statistic ─────────────────────────────────────
export function InsightHero({ kicker, headline, primaryStat, primaryStatSuffix, supportingText, sampleSizeText, ctaType = "none", swipePrompt, ctaLabel }) {
  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:24px;padding-bottom:24px;transform:translateY(${COMPOSITION.heroShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1Headline}px;max-width:880px;">${headline}</div>
    <div style="margin-top:40px;display:flex;align-items:flex-end;gap:20px;">
      <div style="font-family:'Inter Tight',Arial,sans-serif;font-weight:900;font-size:${TYPOGRAPHY.l1HeroStat}px;line-height:0.85;color:${COLORS.cyan};letter-spacing:-4px;">${escapeHtml(primaryStat)}</div>
      ${primaryStatSuffix ? `<div style="font-size:${TYPOGRAPHY.l2Caveat}px;font-weight:800;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.3px;line-height:1.2;padding-bottom:20px;max-width:430px;">${escapeHtml(primaryStatSuffix)}</div>` : ""}
    </div>
    ${supportingText ? `<div class="dl-body-text" style="margin-top:30px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt, ctaLabel });
}

// ── 2. StatComparison — 2-3 values side by side ─────────────────────────────────────────────────
export function StatComparison({ kicker, headline, items = [], note, supportingText, sampleSizeText, ctaType = "none", swipePrompt }) {
  const blocks = items
    .map(
      (item, i) => `${i > 0 ? `<div style="width:1px;background:${COLORS.border};align-self:stretch;margin:6px 0;"></div>` : ""}
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 26px;">
        <div style="font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:700;letter-spacing:0.3px;color:${COLORS.muted};text-transform:uppercase;margin-bottom:10px;">${escapeHtml(item.label)}</div>
        <div style="font-family:'Inter Tight',Arial,sans-serif;font-weight:900;font-size:${item.value.length > 6 ? 58 : 78}px;line-height:1;color:${TONE_COLOR[item.tone] ?? COLORS.text};letter-spacing:-1px;">${escapeHtml(item.value)}</div>
        ${item.sub ? `<div style="font-size:${TYPOGRAPHY.l2ChartLabel}px;font-weight:600;color:${COLORS.muted};margin-top:12px;line-height:1.28;">${escapeHtml(item.sub)}</div>` : ""}
      </div>`,
    )
    .join("");

  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:24px;padding-bottom:24px;transform:translateY(${COMPOSITION.comparisonShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1HeadlineCompact}px;max-width:900px;margin-bottom:48px;">${headline}</div>
    ${note ? `<div style="font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:800;letter-spacing:0.6px;color:${COLORS.cyan};text-transform:uppercase;text-align:right;margin-bottom:12px;">${escapeHtml(note)}</div>` : ""}
    <div style="display:flex;align-items:stretch;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;padding:38px 8px;">${blocks}</div>
    ${supportingText ? `<div class="dl-body-text" style="margin-top:36px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 3. RankedBars — horizontal ranked comparison, optionally with a station icon per row ────────
export function RankedBars({ kicker, headline, bars = [], axisNote, supportingText, sampleSizeText, ctaType = "none", swipePrompt }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.magnitude)), 1);
  const rows = bars
    .map((bar) => {
      const widthPct = Math.max(4, Math.round((Math.abs(bar.magnitude) / max) * 100));
      const color = TONE_COLOR[bar.tone] ?? COLORS.cyan;
      return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
        <div style="width:248px;flex-shrink:0;font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:700;color:${COLORS.text};text-transform:uppercase;letter-spacing:0.1px;line-height:1.15;">${escapeHtml(bar.label)}</div>
        <div style="flex:1;height:34px;background:rgba(255,255,255,0.05);border-radius:6px;overflow:hidden;position:relative;">
          <div style="width:${widthPct}%;height:100%;background:${color};border-radius:6px;"></div>
        </div>
        <div style="width:118px;flex-shrink:0;text-align:right;font-family:'Inter Tight',Arial,sans-serif;font-weight:800;font-size:${TYPOGRAPHY.l2ChartLabel}px;color:${color};">${escapeHtml(bar.displayValue)}</div>
      </div>`;
    })
    .join("");

  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:20px;padding-bottom:20px;transform:translateY(${COMPOSITION.chartShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1ChartHeadline}px;max-width:900px;margin-bottom:8px;">${headline}</div>
    ${axisNote ? `<div style="font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:600;color:${COLORS.muted};margin-bottom:32px;">${escapeHtml(axisNote)}</div>` : `<div style="margin-bottom:32px;"></div>`}
    <div>${rows}</div>
    ${supportingText ? `<div class="dl-body-text" style="margin-top:24px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 4. PaceProgression — line series across ordered x-points (Run1-8, or age bands) ─────────────
// height is taller than the visible chart block implies (chartH = height - 70) — the extra
// vertical scale exists specifically so two close-together series (e.g. Run 8's male/female
// lines converging near the same point) render with enough real separation that an endpoint
// value label doesn't sit on top of the other series' line. Prefer growing this over shrinking
// label font size when two elements collide (mobile-readability audit, 2026-08).
function progressionSvg(series, { width = 950, height = 440, yPadTopFactor = 0.18, yPadBottomFactor = 0.18, valueLabelOffsetY = -18 }) {
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yRange = yMax - yMin || 1;
  const lo = yMin - yRange * yPadBottomFactor;
  const hi = yMax + yRange * yPadTopFactor;
  const n = series[0]?.points.length ?? 1;
  const chartH = height - 70;
  const stepX = n > 1 ? width / (n - 1) : width;
  const scaleY = (v) => chartH - ((v - lo) / (hi - lo)) * chartH;

  const gridlines = [0, 0.5, 1]
    .map((t) => {
      const y = chartH - t * chartH;
      return `<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    })
    .join("");

  const lines = series
    .map((s) => {
      const pts = s.points.map((p, i) => `${(i * stepX).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(" ");
      const dots = s.points
        .map(
          (p, i) => `<circle cx="${(i * stepX).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}" r="7" fill="${s.color}"/>`,
        )
        .join("");
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    })
    .join("");

  // Optional endpoint value labels — a point opts in by carrying `valueLabel` (e.g. the mm:ss
  // already shown elsewhere for that same data point). Kept opt-in per-point rather than a global
  // flag so callers can label just the first/last point of a series without a bespoke component.
  const valueLabels = series
    .flatMap((s) =>
      s.points.map((p, i) => ({ p, i, color: s.color, isFirst: i === 0, isLast: i === n - 1 })),
    )
    .filter(({ p }) => p.valueLabel)
    .map(({ p, i, color, isFirst, isLast }) => {
      const x = i * stepX + (p.valueLabelDx ?? (isFirst ? 8 : isLast ? -8 : 0));
      const y = scaleY(p.y) + (p.valueLabelDy ?? valueLabelOffsetY);
      const anchor = p.valueLabelAnchor ?? (isFirst ? "start" : isLast ? "end" : "middle");
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" fill="${color}" font-size="${TYPOGRAPHY.l2ChartSmall}" font-weight="800" font-family="'Inter Tight',sans-serif">${escapeHtml(p.valueLabel)}</text>`;
    })
    .join("");

  const xLabels = (series[0]?.points ?? [])
    .map(
      (p, i) => `<text x="${(i * stepX).toFixed(1)}" y="${chartH + 42}" text-anchor="middle" fill="${COLORS.muted}" font-size="${TYPOGRAPHY.l2ChartSmall}" font-weight="700" font-family="'Inter Tight',sans-serif">${escapeHtml(p.label)}</text>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
    ${gridlines}
    ${lines}
    ${valueLabels}
    ${xLabels}
  </svg>`;
}

export function PaceProgression({ kicker, headline, series = [], legend = [], supportingText, sampleSizeText, ctaType = "none", swipePrompt, chartScale = {} }) {
  const legendHtml = legend
    .map(
      (l) => `<div style="display:flex;align-items:center;gap:9px;font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:700;color:${COLORS.muted};">
      <div style="width:14px;height:14px;border-radius:50%;background:${l.color};"></div>${escapeHtml(l.label)}
    </div>`,
    )
    .join(`<div style="width:28px;"></div>`);

  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:20px;padding-bottom:20px;transform:translateY(${COMPOSITION.chartShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1ChartHeadline}px;max-width:900px;margin-bottom:18px;">${headline}</div>
    ${legend.length ? `<div style="display:flex;align-items:center;margin-bottom:22px;">${legendHtml}</div>` : ""}
    ${progressionSvg(series, chartScale)}
    ${supportingText ? `<div class="dl-body-text" style="margin-top:30px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 5. ThresholdComparison — stacked-bar decomposition of a time gap ────────────────────────────
export function ThresholdComparison({ kicker, headline, segments = [], bandLabel, totalLabel, legend = [], supportingText, sampleSizeText, ctaType = "none", swipePrompt }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const bar = segments
    .map((s) => {
      const widthPct = ((s.value / total) * 100).toFixed(1);
      return `<div style="width:${widthPct}%;background:${s.color};height:100%;display:flex;align-items:center;justify-content:center;">
        <span style="font-family:'Inter Tight',Arial,sans-serif;font-weight:800;font-size:${TYPOGRAPHY.l2ChartSmall}px;color:#06101e;">${s.pctLabel}</span>
      </div>`;
    })
    .join("");

  const legendHtml = legend
    .map(
      (l) => `<div style="display:flex;align-items:center;gap:9px;font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:700;color:${COLORS.muted};">
      <div style="width:14px;height:14px;border-radius:4px;background:${l.color};"></div>${escapeHtml(l.label)}
    </div>`,
    )
    .join(`<div style="width:26px;"></div>`);

  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:20px;padding-bottom:20px;transform:translateY(${COMPOSITION.comparisonShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1ChartHeadline}px;max-width:900px;margin-bottom:36px;">${headline}</div>
    ${bandLabel ? `<div style="font-size:${TYPOGRAPHY.l2ChartSmall}px;font-weight:700;color:${COLORS.text};margin-bottom:14px;">${escapeHtml(bandLabel)}${totalLabel ? ` <span style="color:${COLORS.muted};font-weight:600;">(${escapeHtml(totalLabel)})</span>` : ""}</div>` : ""}
    <div style="display:flex;height:76px;border-radius:10px;overflow:hidden;border:1px solid ${COLORS.border};">${bar}</div>
    <div style="display:flex;align-items:center;gap:0;margin-top:22px;">${legendHtml}</div>
    ${supportingText ? `<div class="dl-body-text" style="margin-top:30px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 6. DistributionCard — a percentile bar with a threshold marker (not a fabricated bell curve —
//    we only have the actual percentile figure, not a full density shape, so this stays defensible) ──
export function DistributionCard({ kicker, headline, markerPct, markerLabel, statValue, statLabel, supportingText, sampleSizeText, ctaType = "none", swipePrompt }) {
  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:24px;padding-bottom:24px;transform:translateY(${COMPOSITION.heroShiftY}px);">
    ${kickerLabel(kicker)}
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1HeadlineCompact}px;max-width:880px;margin-bottom:44px;">${headline}</div>
    <div style="position:relative;height:56px;border-radius:8px;overflow:visible;background:linear-gradient(90deg, ${COLORS.cyan} 0%, rgba(34,211,238,0.15) ${markerPct}%, rgba(255,255,255,0.05) ${markerPct}%);">
      <div style="position:absolute;left:${markerPct}%;top:-14px;bottom:-14px;width:3px;background:${COLORS.text};"></div>
      <div style="position:absolute;left:${markerPct}%;top:-58px;transform:translateX(-50%);font-family:'Inter Tight',Arial,sans-serif;font-weight:800;font-size:${TYPOGRAPHY.l2ChartSmall}px;color:${COLORS.text};white-space:nowrap;">${escapeHtml(markerLabel)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:${TYPOGRAPHY.l3Footer}px;font-weight:600;color:${COLORS.muted};"><span>SLOWEST</span><span>FASTEST</span></div>
    <div style="margin-top:52px;display:flex;align-items:baseline;gap:16px;">
      <div style="font-family:'Inter Tight',Arial,sans-serif;font-weight:900;font-size:120px;line-height:0.9;color:${COLORS.cyan};letter-spacing:-3px;">${escapeHtml(statValue)}</div>
      <div style="font-size:${TYPOGRAPHY.l2ChartLabel}px;font-weight:700;color:${COLORS.muted};text-transform:uppercase;max-width:280px;line-height:1.3;">${escapeHtml(statLabel)}</div>
    </div>
    ${supportingText ? `<div class="dl-body-text" style="margin-top:34px;max-width:820px;">${supportingText}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 7. AthleteTakeaway — closing "what this means" slide for carousels ──────────────────────────
// statLine is an optional secondary hero-style number/comparison (e.g. "WOMEN +29% · MEN +36%")
// that needs its own visual tier between the main takeaway sentence and the smaller caveat below
// it — added so a slide can promote a comparison out of caveat-sized text without inflating the
// caveat itself (mobile-readability audit, 2026-08).
export function AthleteTakeaway({ headline = "WHAT THIS MEANS", text, statLine, caveat, caveatFontSize = TYPOGRAPHY.l2Caveat, sampleSizeText, ctaType = "none", swipePrompt }) {
  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px 84px;transform:translateY(${COMPOSITION.meaningShiftY}px);">
    <div style="font-size:${TYPOGRAPHY.l2ChartLabel}px;font-weight:800;letter-spacing:1.5px;color:${COLORS.cyan};text-transform:uppercase;margin-bottom:30px;">${escapeHtml(headline)}</div>
    <div style="width:120px;height:2px;background:${COLORS.cyan};margin-bottom:38px;"></div>
    <div style="font-family:'Inter Tight',Arial,sans-serif;font-weight:700;font-size:${TYPOGRAPHY.l2Takeaway}px;line-height:1.3;color:${COLORS.text};">${text}</div>
    ${statLine ? `<div style="font-family:'Inter Tight',Arial,sans-serif;font-weight:900;font-size:48px;letter-spacing:0.3px;color:${COLORS.cyan};margin-top:32px;">${escapeHtml(statLine)}</div>` : ""}
    ${caveat ? `<div style="font-size:${caveatFontSize}px;font-weight:600;color:${COLORS.muted};margin-top:36px;line-height:1.4;max-width:680px;">${escapeHtml(caveat)}</div>` : ""}
  </div>`;
  return shell(content, { sampleSizeText, ctaType, swipePrompt });
}

// ── 8. InsightCTA — dedicated calculator-bridge slide, reserved for direct-CTA flagship posts ───
export function InsightCTA({ headline, bullets = [], buttonText = "ANALYSE MY HYROX FREE", sampleSizeText }) {
  const bulletsHtml = bullets
    .map(
      (b) => `<li style="font-size:${TYPOGRAPHY.l2Caveat}px;font-weight:600;color:${COLORS.text};margin:18px 0;line-height:1.3;display:flex;gap:14px;align-items:flex-start;">
      <span style="color:${COLORS.cyan};font-weight:900;">&#10003;</span><span>${escapeHtml(b)}</span>
    </li>`,
    )
    .join("");

  const content = `<div class="gutter" style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px 90px;transform:translateY(${COMPOSITION.ctaShiftY}px);">
    <div class="dl-headline" style="font-size:${TYPOGRAPHY.l1HeadlineCompact}px;margin-bottom:34px;">${headline}</div>
    <ul style="list-style:none;text-align:left;margin-bottom:46px;">${bulletsHtml}</ul>
    <div style="width:440px;height:70px;border-radius:8px;background:${COLORS.cyan};display:flex;align-items:center;justify-content:center;font-family:'Inter Tight',Arial,sans-serif;font-weight:800;font-size:24px;letter-spacing:0.3px;color:#06101e;text-transform:uppercase;">${escapeHtml(buttonText)}</div>
    <div style="margin-top:22px;font-size:${TYPOGRAPHY.l3Footer}px;font-weight:700;color:${COLORS.cyan};letter-spacing:0.3px;">www.getforma.fit</div>
    <div style="width:200px;height:1px;background:${COLORS.border};margin:40px 0 20px;"></div>
    <div style="font-size:30px;font-weight:900;letter-spacing:2px;color:${COLORS.text};">FORMA</div>
    <div style="font-size:${TYPOGRAPHY.l3Url}px;font-weight:600;color:${COLORS.muted};margin-top:6px;">Measure. Understand. Improve.</div>
  </div>`;
  return shell(content, { sampleSizeText, ctaType: "none" });
}
