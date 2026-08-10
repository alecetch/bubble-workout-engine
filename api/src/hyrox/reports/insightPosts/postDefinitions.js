// Structured post definitions for Forma's HYROX data-insight Instagram library.
//
// Every fact below (keyStatistic, supportingStatistics, population, sampleSize) is copied
// verbatim from docs/planning/instagram-hooks-analyse-results.md — the approved 17-insight
// analysis. sourceReference points at the exact section so any number here can be traced back:
// post -> insight definition (this file) -> query -> dataset -> result (Phase 10 of the brief).
//
// insightId matches the numbering in that document's §3/§4. postNumber is the publishing order
// from docs/planning/instagram-hooks-posts-plan.md (15 launch posts + 1 held-back). Insight #17
// (men fade more than women on Run 8) was folded into post 2's caption as a footnote rather than
// given its own post, per review — see the plan doc's Part D.

export const HASHTAGS = "#HYROX #HYROXTraining #HYROXData #HybridAthlete #HYROXCommunity";

const SOURCE_DOC = "docs/planning/instagram-hooks-analyse-results.md";

export const POSTS = [
  // ── 1 (insight 9) — opener ──────────────────────────────────────────────────────────────────
  {
    id: "001-sub75-rarity",
    insightId: 9,
    postNumber: 1,
    title: "How rare is a sub-75 HYROX?",
    hook: "How rare is a sub-75 HYROX?",
    format: "A",
    slideCount: 1,
    population: "Open Male + Open Female, season 8 (2025–26), valid results",
    sampleSize: "n=140,625 (M) / n=84,009 (F)",
    keyStatistic: "19.9% of Open Male finishers went sub-75",
    supportingStatistics: ["12.7% of Open Female finishers went sub-80"],
    interpretation: "A sub-75 Open Male finish isn't just a respectable benchmark — in the 2025–26 worldwide results, it's fastest-fifth-of-the-field territory.",
    caveat: "Reflects the recorded 2025–26 field, not all HYROX athletes globally.",
    calculatorMode: "predict",
    ctaType: "direct",
    ctaText: "See where your own target time ranks — free with Forma.",
    sourceReference: `${SOURCE_DOC} §2.1, §4 Insight 9`,
    slides: [
      {
        component: "InsightHero",
        kicker: "BENCHMARK",
        headline: "How rare is a<br>sub-75 HYROX?",
        primaryStat: "19.9%",
        primaryStatSuffix: "OF OPEN MEN WENT SUB-75",
        supportingText: "Sub-75 puts Open Men among the fastest fifth of the field.",
        sampleSizeText: "n=140,625 Open Male / n=84,009 Open Female · Forma 2025–26 worldwide dataset",
        ctaType: "direct",
        ctaLabel: "See your rank\u00a0→",
      },
    ],
    caption: `How rare is a sub-75 HYROX, really?

We analysed every valid Open Male result in the Forma 2025–26 dataset — 140,625 races.

Only 19.9% finished under 75 minutes.

That's roughly 1 in 5 athletes.

For Open Female athletes, 12.7% of 84,009 results finished sub-80 — roughly 1 in 8.

So a sub-75 Open Male finish isn't simply a respectable benchmark. In the 2025–26 worldwide results, it puts you in approximately the fastest fifth of the field.

And that raises a more useful question:

Where does your own target time actually rank?

Analysis: 140,625 Open Male results and 84,009 Open Female results from the Forma 2025–26 worldwide HYROX dataset.

See where your race ranks with the free Forma HYROX Calculator — link in bio.

${HASHTAGS}`,
  },

  // ── 2 (insight 2, + insight 17 folded in as footnote) ───────────────────────────────────────
  {
    id: "002-run8-collapse",
    insightId: 2,
    postNumber: 2,
    title: "The run where HYROX athletes fall apart",
    hook: "The run where HYROX athletes fall apart",
    format: "B",
    slideCount: 3,
    population: "Open Male + Open Female, season 8 (2025–26), valid, split_coverage ≥0.97",
    sampleSize: "n=224,634 combined",
    keyStatistic: "Run 8 is 36.2% slower than Run 1 (men) / 29.2% slower (women)",
    supportingStatistics: ["Runs 2–7 drift up gradually; Run 8 is the only large jump"],
    interpretation: "Run 8 isn't a gradual drift — it's a cliff. That's the leg training should target.",
    caveat: "Women's Run 8 fade (+29.2%) is proportionally smaller than men's (+36.2%) — could reflect pacing strategy or race-experience differences in the recorded fields, not an inherent sex-based endurance claim.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.2, §4 Insight 2`,
    slides: [
      {
        component: "InsightHero",
        kicker: "RACE ANATOMY",
        headline: "The run where HYROX athletes fall apart",
        primaryStat: "+36%",
        primaryStatSuffix: "SLOWER THAN RUN 1",
        supportingText: "Same distance. Very different pace.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see all 8 runs",
      },
      {
        component: "PaceProgression",
        kicker: "8 RUNS, SAME DISTANCE",
        headline: "Average 1km time by run",
        legend: [
          { label: "Open Male", color: "#22d3ee" },
          { label: "Open Female", color: "#fbbf24" },
        ],
        series: [
          {
            name: "Open Male",
            color: "#22d3ee",
            points: [
              { x: 1, y: 280, label: "R1", valueLabel: "4:40" },
              { x: 2, y: 295, label: "R2" },
              { x: 3, y: 319, label: "R3" },
              { x: 4, y: 318, label: "R4" },
              { x: 5, y: 331, label: "R5" },
              { x: 6, y: 322, label: "R6" },
              { x: 7, y: 322, label: "R7" },
              { x: 8, y: 381, label: "R8", valueLabel: "6:21" },
            ],
          },
          {
            name: "Open Female",
            color: "#fbbf24",
            points: [
              { x: 1, y: 325, label: "R1", valueLabel: "5:25" },
              { x: 2, y: 339, label: "R2" },
              { x: 3, y: 357, label: "R3" },
              { x: 4, y: 359, label: "R4" },
              { x: 5, y: 372, label: "R5" },
              { x: 6, y: 364, label: "R6" },
              { x: 7, y: 363, label: "R7" },
              { x: 8, y: 420, label: "R8", valueLabel: "7:00" },
            ],
          },
        ],
        supportingText: "RUNS 2–7 SLOW GRADUALLY.<br>RUN 8 IS THE BIGGEST JUMP.",
        sampleSizeText: "n=140,625 (M) / n=84,009 (F) · average time per 1km leg",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: `Run 8 is where running performance deteriorates most. Your training needs to prepare you to run well when your legs are already compromised.`,
        statLine: "WOMEN +29% · MEN +36%",
        caveat: "The data doesn't tell us why — pacing, experience and field composition could all contribute.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `The run where HYROX athletes fall apart.

Every HYROX race has eight 1 km runs. But athletes don't hold the same pace across all eight.

Across 140,625 Open Male results, run times rise gradually through the middle of the race.

Then Run 8 jumps.

The average Open Male Run 8 was 36% slower than Run 1.

For 84,009 Open Female results, the increase was 29%.

And the location of that deterioration is interesting.

Run 8 comes immediately after Sandbag Lunges, with seven stations and seven previous runs already in the legs.

The data can't tell us how much of the slowdown is caused specifically by the lunges versus accumulated race fatigue.

What it can tell us is clear: the final kilometre is where pace deteriorates most.

Women's Run 8 deterioration was smaller in this dataset (+29% vs +36%). We don't know why — pacing, experience and differences in the recorded field could all contribute.

Analysis based on 140,625 Open Male and 84,009 Open Female results from the Forma 2025–26 worldwide HYROX dataset.

What happens to your pace on Run 8?

${HASHTAGS}`,
  },

  // ── 3 (insight 1) ────────────────────────────────────────────────────────────────────────────
  {
    id: "003-consistency-vs-brilliance",
    insightId: 1,
    postNumber: 3,
    title: "Fast HYROX athletes have fewer weak links",
    hook: "Fast HYROX athletes have fewer weak links",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97, top/mid/bottom deciles",
    sampleSize: "n=44,842",
    keyStatistic: "Top 10% finishers show 3.3x tighter station-to-station spread than bottom 10%",
    supportingStatistics: ["Top 10%: 0.284 SD spread · Bottom 10%: 0.938 SD spread", "Best-to-worst station gap: 0.90 SD (top) vs 2.97 SD (bottom)"],
    interpretation: "Top-10% finishers are far less likely to carry one major station weakness through their race.",
    caveat: "Z-scores are relative to this field, not an absolute strength/weakness scale — doesn't identify which station is any individual's weak link.",
    calculatorMode: "analyse",
    ctaType: "soft",
    ctaText: "Want to find your weakest link? Analyse your race free with Forma.",
    sourceReference: `${SOURCE_DOC} §2.9, §4 Insight 1`,
    slides: [
      {
        component: "InsightHero",
        kicker: "CONSISTENCY LAB",
        headline: "Fast HYROX athletes have fewer weak links",
        primaryStat: "3.3×",
        primaryStatSuffix: "TIGHTER STATION SPREAD — TOP 10% VS BOTTOM 10%",
        supportingText: "They don't need every station to be exceptional. What stands out is the absence of major weaknesses.",
        sampleSizeText: "n=44,842 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see the spread, side by side",
      },
      {
        component: "StatComparison",
        kicker: "STATION-TO-STATION SPREAD",
        headline: "How much does one athlete's own 8 stations vary?",
        note: "LOWER = MORE CONSISTENT",
        items: [
          { label: "TOP 10% FINISHERS", value: "0.28 SD", sub: "tight cluster across all 8 stations", tone: "positive" },
          { label: "BOTTOM 10% FINISHERS", value: "0.94 SD", sub: "one or two stations are far off the rest", tone: "negative" },
        ],
        supportingText: "Top-10% finishers show a station spread more than 3× tighter than bottom-10% finishers.",
        sampleSizeText: "n=14,020 (top 10%) / n=15,411 (bottom 10%)",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Consistency is one of the clearest differences between top and bottom finishers. Top-10% finishers are far less likely to carry one major station weakness through their race.",
        caveat: "This is relative to the field, not an absolute scale — it doesn't identify which station is any one athlete's weak link.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "soft",
      },
    ],
    caption: `Fast HYROX athletes have fewer weak links.

We normalised each Open Male athlete's eight station performances against the field, then looked at how widely those station results varied within the same athlete.

Top-10% finishers showed a tight 0.28 SD station-to-station spread. Bottom-10% finishers were at 0.94 SD — more than 3x wider.

The best-to-worst station gap showed the same pattern: 0.90 SD for the top decile, 2.97 SD for the bottom.

It's tempting to assume the fastest athletes simply crush every station. That isn't what this analysis measures. What stands out instead is how rarely top finishers have one station dramatically out of line with the rest of their race.

Station-to-station consistency is one of the clearest differences between the top and bottom deciles.

Analysis based on 44,842 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

Want to see where your own race is strong — and where the biggest gap sits? Analyse it at getforma.fit.

${HASHTAGS}`,
  },

  // ── 4 (insight 7) ────────────────────────────────────────────────────────────────────────────
  {
    id: "004-sandbag-lunge-spread",
    insightId: 7,
    postNumber: 4,
    title: "The station that spreads the field most",
    hook: "The station that spreads the field most",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Sandbag lunge has the highest coefficient of variation of any segment (49.6%)",
    supportingStatistics: ["RoxZone: 43.7% · Wall balls: 41.7% · Burpee broad jumps: 35.3%"],
    interpretation: "No part of a HYROX race varies between athletes more than the sandbag lunge.",
    caveat: "High CV reflects spread, not difficulty — doesn't mean it's the hardest station in absolute terms, just the most differentiating one.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.4, §4 Insight 7`,
    slides: [
      {
        component: "InsightHero",
        kicker: "RACE ANATOMY",
        headline: "The station that spreads the field most",
        primaryStat: "49.6%",
        primaryStatSuffix: "COEFFICIENT OF VARIATION — SANDBAG LUNGE",
        supportingText: "No part of a HYROX race varies between athletes more than this one.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see how every station ranks",
      },
      {
        component: "RankedBars",
        kicker: "SPREAD BY SEGMENT",
        headline: "Coefficient of variation, all 8 stations + RoxZone",
        axisNote: "Higher = more spread between athletes on that segment",
        bars: [
          { label: "Sandbag Lunge", magnitude: 49.6, displayValue: "49.6%", tone: "negative" },
          { label: "RoxZone", magnitude: 43.7, displayValue: "43.7%", tone: "amber" },
          { label: "Wall Balls", magnitude: 41.7, displayValue: "41.7%", tone: "amber" },
          { label: "Burpee BJ", magnitude: 35.3, displayValue: "35.3%", tone: "amber" },
          { label: "Sled Push", magnitude: 33.2, displayValue: "33.2%", tone: "neutral" },
          { label: "Farmers Carry", magnitude: 31.1, displayValue: "31.1%", tone: "neutral" },
          { label: "Sled Pull", magnitude: 29.5, displayValue: "29.5%", tone: "neutral" },
          { label: "Row", magnitude: 11.6, displayValue: "11.6%", tone: "positive" },
          { label: "SkiErg", magnitude: 8.8, displayValue: "8.8%", tone: "positive" },
        ],
        sampleSizeText: "n=140,625 Open Male",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Sandbag lunge sits late in the race, loaded, unglamorous — and it's where real separation between athletes actually happens.",
        caveat: "High spread doesn't mean hardest in absolute terms — it means most differentiating between athletes.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `The station that spreads the field most.

We measured how much each HYROX segment varies between athletes, relative to its own average time — the coefficient of variation. The winner: sandbag lunge, at 49.6%. Nothing else in the race comes close.

RoxZone (43.7%) and wall balls (41.7%) are next. At the other end, SkiErg (8.8%) and row (11.6%) barely vary at all — everyone does roughly the same relative time on those, regardless of ability.

High spread doesn't mean "hardest" in absolute terms. It means this is where real separation between athletes happens — a station where being strong (or weak) actually shows up in the result.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

Which station costs you the most time? Tell us below.

${HASHTAGS}`,
  },

  // ── 5 (insight 10) ───────────────────────────────────────────────────────────────────────────
  {
    id: "005-skierg-row-levelers",
    insightId: 10,
    postNumber: 5,
    title: "The 2 stations that don't decide your race",
    hook: "The 2 stations that don't decide your race",
    format: "A",
    slideCount: 1,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "SkiErg (8.8%) and Row (11.6%) have by far the lowest spread of any HYROX segment",
    supportingStatistics: ["Sandbag lunge, by comparison, spreads the field at 49.6%"],
    interpretation: "Everyone, regardless of ability, does roughly the same relative time on these two.",
    caveat: "Low spread ≠ unimportant to train — it means the field is already close together there, so it's not where races are typically decided.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.4, results doc insight #10`,
    slides: [
      {
        component: "InsightHero",
        kicker: "RACE ANATOMY",
        headline: "The 2 stations that don't decide your HYROX",
        primaryStat: "8.8%",
        primaryStatSuffix: "SPREAD ON SKIERG — LOWEST OF ANY SEGMENT",
        supportingText: "Row is close behind at 11.6%. Compare that to sandbag lunge's 49.6% — the field barely separates on these two, whatever your ability level.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
      },
    ],
    caption: `The 2 stations that don't decide your race.

We ranked all 8 HYROX stations plus RoxZone by how much they vary between athletes. SkiErg (8.8% spread) and row (11.6%) sit far below everything else — sandbag lunge, by contrast, spreads the field at 49.6%.

That doesn't mean SkiErg and row don't matter, or that you shouldn't train them. It means the field is already close together there — they're not usually where races are won or lost.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

${HASHTAGS}`,
  },

  // ── 6 (insight 5) ────────────────────────────────────────────────────────────────────────────
  {
    id: "006-running-beats-every-station",
    insightId: 5,
    postNumber: 6,
    title: "No station predicts your time like your running does",
    hook: "No station predicts your time like your running does",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Average run pace correlates with finish time at r=0.904 — higher than any single station",
    supportingStatistics: ["Best station: burpee broad jumps, r=0.809", "Wall balls: r=0.782 · Sled pull: r=0.777"],
    interpretation: "Your average km pace is a stronger single signal of your finish time than any individual station.",
    caveat: "Correlation, not causation — a strong runner is often a fitter athlete overall, so this doesn't isolate running training as the one lever.",
    calculatorMode: "analyse",
    ctaType: "soft",
    ctaText: "See how your running pace stacks up — analyse your race with Forma.",
    sourceReference: `${SOURCE_DOC} §2.4, §4 Insight 5`,
    slides: [
      {
        component: "InsightHero",
        kicker: "WHERE RACES ARE WON",
        headline: "No station predicts your time like your running does",
        primaryStat: "0.90",
        primaryStatSuffix: "CORRELATION, RUN PACE VS FINISH TIME",
        supportingText: "Higher than any single one of the 8 stations.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see the full ranking",
      },
      {
        component: "RankedBars",
        kicker: "PREDICTIVE POWER",
        headline: "Correlation with overall finish time",
        axisNote: "Higher = stronger single predictor of your finish time",
        bars: [
          { label: "Running", magnitude: 0.904, displayValue: "0.90", tone: "positive" },
          { label: "Burpee BJ", magnitude: 0.809, displayValue: "0.81", tone: "amber" },
          { label: "Wall Balls", magnitude: 0.782, displayValue: "0.78", tone: "amber" },
          { label: "Sled Pull", magnitude: 0.777, displayValue: "0.78", tone: "amber" },
          { label: "Row", magnitude: 0.707, displayValue: "0.71", tone: "neutral" },
          { label: "RoxZone", magnitude: 0.657, displayValue: "0.66", tone: "neutral" },
          { label: "SkiErg", magnitude: 0.681, displayValue: "0.68", tone: "neutral" },
          { label: "Sled Push", magnitude: 0.640, displayValue: "0.64", tone: "neutral" },
          { label: "Farmers Carry", magnitude: 0.626, displayValue: "0.63", tone: "neutral" },
          { label: "Sandbag Lunge", magnitude: 0.566, displayValue: "0.57", tone: "neutral" },
        ],
        sampleSizeText: "n=140,625 Open Male",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Everyone obsesses over one 'make or break' station. None of them beat running. Your 1km pace is still the strongest single signal you have.",
        caveat: "Correlation, not causation — a strong runner is usually a fitter athlete overall too.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "soft",
      },
    ],
    caption: `No station predicts your HYROX time like your running does.

We correlated every segment of the race — all 8 stations, RoxZone, and average run pace — against overall finish time. Running pace came out on top at r=0.90. The closest station, burpee broad jumps, sits at r=0.81.

Wall balls and sled pull are close behind. SkiErg, sled push, farmers carry and sandbag lunge all sit further back.

Everyone obsesses over one "make or break" station. None of them beat running as a predictor. Your average kilometre pace is still the strongest single signal you have of your finish time.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

See how your own running pace stacks up — analyse your race free at getforma.fit.

${HASHTAGS}`,
  },

  // ── 7 (insight 13) ───────────────────────────────────────────────────────────────────────────
  {
    id: "007-stations-win-as-a-team",
    insightId: 13,
    postNumber: 7,
    title: "Running wins 1-on-1. Stations win as a team.",
    hook: "Running wins 1-on-1. Stations win as a team.",
    format: "B",
    slideCount: 3,
    population: "Open Male + Open Female, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625 (M) / n=84,009 (F)",
    keyStatistic: "Station total explains slightly more of finish time (R²=0.827) than run total (R²=0.817), men",
    supportingStatistics: ["Women: station R²=0.873 vs run R²=0.820"],
    interpretation: "Individually, running predicts you best. Collectively, all 8 stations together explain slightly more of the outcome.",
    caveat: "Both things are true at once — this isn't a contradiction of the previous post, it's the difference between one segment and eight summed together.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.4, results doc insight #13`,
    slides: [
      {
        component: "InsightHero",
        kicker: "WHERE RACES ARE WON — PART 2",
        headline: "Running wins 1-on-1. Stations win as a team.",
        primaryStat: "82.7%",
        primaryStatSuffix: "OF FINISH-TIME EXPLAINED BY ALL 8 STATIONS",
        supportingText: "Slightly ahead of running's 81.7% — even though no single station beats running alone.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see running vs. stations, head to head",
      },
      {
        component: "StatComparison",
        kicker: "RUN TOTAL VS STATION TOTAL",
        headline: "Which explains more of your finish time?",
        items: [
          { label: "RUN TOTAL (R²)", value: "81.7%", sub: "1 segment, 8 combined runs", tone: "positive" },
          { label: "STATION TOTAL (R²)", value: "82.7%", sub: "8 stations summed together", tone: "amber" },
        ],
        supportingText: "For women the gap is wider: 82.0% (running) vs 87.3% (stations). Both are real, and both are useful to know.",
        sampleSizeText: "n=140,625 (M) / n=84,009 (F)",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "No single station beats running as a predictor. But add up all 8 stations, and they edge out running as a group. Both are true — training your engine and your station strength both genuinely matter.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `Running wins 1-on-1. Stations win as a team.

Running pace beats every single station as a predictor of your finish time — we've shown that before. But sum up all 8 stations together, and the picture flips slightly: station total explains 82.7% of variation in men's finish times, running total 81.7%. For women, the gap is bigger — 87.3% vs 82.0%.

This isn't a contradiction. It's the difference between "one segment vs. one segment" and "one segment vs. eight combined." Individually, nothing beats running. Collectively, your 8 stations carry slightly more of the outcome.

Training your engine and training your station strength both genuinely move the needle — just via different arithmetic.

Analysis based on 140,625 Open Male and 84,009 Open Female results from the Forma 2025–26 worldwide HYROX dataset.

${HASHTAGS}`,
  },

  // ── 8 (insight 11) ───────────────────────────────────────────────────────────────────────────
  {
    id: "008-wallballs-burpees-strength-test",
    insightId: 11,
    postNumber: 8,
    title: "The station that tells you if you're actually strong",
    hook: "The station that tells you if you're actually strong",
    format: "A",
    slideCount: 1,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Burpee broad jumps correlate with overall finish time at r=0.81 — the strongest single station",
    supportingStatistics: ["Wall balls close behind at r=0.78"],
    interpretation: "If you want a proxy for overall HYROX ability from one station, this is the closest thing to it.",
    caveat: "Correlational — a strong overall athlete tends to be strong here, not proof this station causes better finishes.",
    calculatorMode: "analyse",
    ctaType: "soft",
    ctaText: "See how your station strength compares — analyse your race with Forma.",
    sourceReference: `${SOURCE_DOC} §2.4`,
    slides: [
      {
        component: "InsightHero",
        kicker: "WHERE RACES ARE WON",
        headline: "The station that tells you if you're actually strong",
        primaryStat: "0.81",
        primaryStatSuffix: "CORRELATION — BURPEE BROAD JUMPS VS FINISH TIME",
        supportingText: "The highest of any single station. Wall balls is close behind at 0.78. If one station has to stand in for overall ability, it's these two.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "soft",
      },
    ],
    caption: `The station that tells you if you're actually strong.

Of the 8 HYROX stations, burpee broad jumps correlates most strongly with overall finish time (r=0.81). Wall balls is close behind at 0.78. Both sit well ahead of the other 6 stations.

That doesn't prove either station makes you fitter — a strong overall athlete tends to be strong here too. But if you wanted one station to gauge where you stand, these are the two that carry the most signal.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

See how your own station strength compares — analyse your race free at getforma.fit.

${HASHTAGS}`,
  },

  // ── 9 (insight 6) ────────────────────────────────────────────────────────────────────────────
  {
    id: "009-sled-myth",
    insightId: 6,
    postNumber: 9,
    title: "Sled push isn't the station that hurts your next run",
    hook: "Sled push isn't the station that hurts your next run",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Run pace right after sled push/pull is within 1% of the athlete's own average pace",
    supportingStatistics: ["The one large downstream cost in the race: after sandbag lunge, +18.6%"],
    interpretation: "The two stations athletes fear most barely dent the run that follows them.",
    caveat: "Confounded with race position — the sandbag lunge → Run 8 transition is also simply the last leg, with the most cumulative fatigue regardless of what preceded it.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.5, §4 Insight 6`,
    slides: [
      {
        component: "InsightHero",
        kicker: "MYTH VS DATA",
        headline: "Sled push isn't the station that hurts your next run",
        primaryStat: "-0.6%",
        primaryStatSuffix: "CHANGE IN RUN PACE RIGHT AFTER SLED PUSH",
        supportingText: "Practically no cost at all — despite how it feels in the moment.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see what actually costs you",
      },
      {
        component: "RankedBars",
        kicker: "DOWNSTREAM RUN COST",
        headline: "Run pace after each station, vs. the athlete's own average",
        axisNote: "0% = no change from personal average pace",
        bars: [
          { label: "Sandbag Lunge", magnitude: 18.6, displayValue: "+18.6%", tone: "negative" },
          { label: "Burpee BJ", magnitude: 3.1, displayValue: "+3.1%", tone: "amber" },
          { label: "Farmers Carry", magnitude: 0.4, displayValue: "+0.4%", tone: "neutral" },
          { label: "Row", magnitude: 0.3, displayValue: "+0.3%", tone: "neutral" },
          { label: "Sled Push", magnitude: 0.6, displayValue: "-0.6%", tone: "positive" },
          { label: "Sled Pull", magnitude: 0.9, displayValue: "-0.9%", tone: "positive" },
          { label: "SkiErg", magnitude: 8.0, displayValue: "-8.0%", tone: "positive" },
        ],
        sampleSizeText: "n=140,625 Open Male",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Sled push and sled pull feel brutal in the moment — but the run right after is barely affected. The real cost shows up much later, into the final run.",
        caveat: "Confounded with race position: the sandbag-lunge transition is also simply the last leg, with the most fatigue already accumulated.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `Sled push isn't the station that hurts your next run.

We measured every athlete's run pace immediately after each station, relative to their own average pace across the race. Sled push and sled pull — the two stations most athletes dread — cost almost nothing: pace afterward is within 1% of average, if not faster.

The one big downstream cost in the whole race comes after sandbag lunge, into Run 8: +18.6% slower than average. Worth being honest about the confound here — that transition is also simply the last leg of the race, with 7 stations of fatigue already behind it, so we can't fully separate "sandbag lunge did this" from "you're just exhausted by then."

Fear the accumulation, not any one station in isolation.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

Which station do you think costs you the most on the run after it?

${HASHTAGS}`,
  },

  // ── 10 (insight 16, companion to 9) ─────────────────────────────────────────────────────────
  {
    id: "010-sandbag-lunge-run8-cost",
    insightId: 16,
    postNumber: 10,
    title: "Sandbag lunge → Run 8 costs more than anything else in the race",
    hook: "Sandbag lunge → Run 8 costs more than anything else in the race",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Run pace after sandbag lunge is 18.6% slower than the athlete's own average",
    supportingStatistics: ["Every other station's downstream cost is under 4%"],
    interpretation: "This is the single largest downstream running cost anywhere in the race.",
    caveat: "Confounded with race position — this is also simply the final leg of the race.",
    calculatorMode: "analyse",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.5, §4 Insight 6 (companion post)`,
    slides: [
      {
        component: "InsightHero",
        kicker: "RACE ANATOMY",
        headline: "Sandbag lunge → Run 8",
        primaryStat: "+18.6%",
        primaryStatSuffix: "SLOWER THAN YOUR OWN AVERAGE PACE",
        supportingText: "The single largest downstream running cost anywhere in a HYROX race — and it happens right after sandbag lunge.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see how it compares to every other station",
      },
      {
        component: "StatComparison",
        kicker: "SANDBAG LUNGE → RUN 8",
        headline: "Compared to every other station's downstream cost",
        items: [
          { label: "AFTER SANDBAG LUNGE", value: "+18.6%", sub: "Run 8 — the final leg", tone: "negative" },
          { label: "EVERY OTHER STATION", value: "<4%", sub: "downstream cost stays close to zero", tone: "positive" },
        ],
        supportingText: "Nothing else in the race comes close to this size of downstream cost.",
        sampleSizeText: "n=140,625 Open Male",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "This is the moment most HYROX training plans should be built around — the last run, loaded with the most fatigue in the race.",
        caveat: "Confounded with race position: this is also simply the final leg, so part of this is unavoidable end-of-race fatigue, not solely a sandbag-lunge effect.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `Sandbag lunge → Run 8 costs more than anything else in a HYROX race.

We measured every athlete's run pace immediately after each of the 8 stations, relative to their own average pace across the race. One transition stands well apart from the rest: sandbag lunge into Run 8, where pace runs 18.6% slower than an athlete's own average. Every other station's downstream cost sits under 4%.

To be fair to the data: Run 8 is also simply the final leg of the race, arriving after 7 stations of accumulated fatigue — so this isn't purely "sandbag lunge did this," it's "sandbag lunge plus everything before it." Both are real.

Either way, this is the single largest downstream running cost anywhere in a HYROX race — and probably where race-specific conditioning work should be pointed.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

${HASHTAGS}`,
  },

  // ── 11 (insight 12) ──────────────────────────────────────────────────────────────────────────
  {
    id: "011-roxzone-nine-percent",
    insightId: 12,
    postNumber: 11,
    title: "The 9 minutes almost nobody trains",
    hook: "The 9 minutes almost nobody trains",
    format: "A",
    slideCount: 1,
    population: "Open Male + Open Female, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625 (M) / n=84,009 (F)",
    keyStatistic: "RoxZone (transitions) makes up 9.1% of the average race",
    supportingStatistics: ["Correlates with finish time at r=0.657 — not a trivial factor"],
    interpretation: "Almost a tenth of your race, and it's rarely the focus of training.",
    caveat: "RoxZone includes queueing/setup time at busier events, not purely athlete-controlled transition speed.",
    calculatorMode: "analyse",
    ctaType: "soft",
    ctaText: "See where your own transitions stand — analyse your race with Forma.",
    sourceReference: `${SOURCE_DOC} §2.4`,
    slides: [
      {
        component: "InsightHero",
        kicker: "RACE ANATOMY",
        headline: "The 9 minutes almost nobody trains",
        primaryStat: "9.1%",
        primaryStatSuffix: "OF THE AVERAGE HYROX RACE IS ROXZONE",
        supportingText: "Almost a tenth of your total time, and it correlates meaningfully with finish time (r=0.66) — this isn't a rounding error.",
        sampleSizeText: "n=140,625 Open Male / n=84,009 Open Female · Forma 2025–26 worldwide dataset",
        ctaType: "soft",
      },
    ],
    caption: `The 9 minutes almost nobody trains.

RoxZone — the transitions between stations and runs — makes up 9.1% of the average men's race and 8.9% of the average women's race in the 2025–26 Forma dataset. It correlates with finish time at r=0.66, which is not a trivial relationship.

Most HYROX training focuses on the runs and the 8 stations. RoxZone rarely gets the same attention, despite being close to a tenth of the entire race.

Analysis based on 140,625 Open Male and 84,009 Open Female results from the Forma 2025–26 worldwide HYROX dataset.

See where your own transitions stand — analyse your race free at getforma.fit.

${HASHTAGS}`,
  },

  // ── 12 (insight 8) ───────────────────────────────────────────────────────────────────────────
  {
    id: "012-starting-fast-myth",
    insightId: 8,
    postNumber: 12,
    title: "Does starting fast ruin your HYROX?",
    hook: "Does starting fast ruin your HYROX?",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,625",
    keyStatistic: "Correlation between Run 1 pace and later fade (Run8−Run1) is r=-0.14 — weak",
    supportingStatistics: ["Fade correlates far more strongly with overall finish time, r=0.55"],
    interpretation: "Fast starters don't fade any more than anyone else — what predicts fade is overall conditioning, not opening pace.",
    caveat: "Weak correlation ≠ zero effect — a population-level pattern, not a guarantee for any individual athlete.",
    calculatorMode: "predict",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.3, §4 Insight 8`,
    slides: [
      {
        component: "InsightHero",
        kicker: "MYTH VS DATA",
        headline: "Does starting fast ruin your HYROX?",
        primaryStat: "-0.14",
        primaryStatSuffix: "CORRELATION, RUN 1 PACE VS LATER FADE",
        supportingText: "A weak relationship — the data doesn't strongly support the 'you blew up because you went out too hard' story.",
        sampleSizeText: "n=140,625 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see what actually predicts the fade",
      },
      {
        component: "StatComparison",
        kicker: "WHAT ACTUALLY PREDICTS FADE",
        headline: "Opening pace vs. overall conditioning",
        items: [
          { label: "RUN 1 PACE → FADE", value: "r = -0.14", sub: "weak relationship", tone: "neutral" },
          { label: "FADE → FINISH TIME", value: "r = 0.55", sub: "much stronger relationship", tone: "negative" },
        ],
        supportingText: "The athletes who fade most were already the slower overall performers — not the fast starters.",
        sampleSizeText: "n=140,625 Open Male",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: '"Don\'t go out too hard" is common HYROX advice. The data barely supports it as the main cause of a late-race fade.',
        caveat: "Weak correlation ≠ zero effect — a population-level pattern, not a guarantee for any individual.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `Does starting fast ruin your HYROX?

We correlated each athlete's Run 1 pace against how much they faded later in the race (Run 8 minus Run 1). The relationship is weak: r=-0.14. Fading correlates far more strongly with overall finish time (r=0.55) than with how fast someone started.

"Don't go out too hard or you'll blow up" is common HYROX advice. The data doesn't strongly back it up as the main driver of a late-race fade — the athletes who fade most were already the slower overall performers, not the fast starters.

Worth the caveat: a weak correlation isn't zero. Some individual athletes genuinely do blow up from an aggressive start. This is a population-level pattern, not a guarantee for any one race.

Analysis based on 140,625 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

${HASHTAGS}`,
  },

  // ── 13 (insight 3) ───────────────────────────────────────────────────────────────────────────
  {
    id: "013-fade-gap-top-vs-bottom",
    insightId: 3,
    postNumber: 13,
    title: "It's not how you start. It's how you finish.",
    hook: "It's not how you start. It's how you finish.",
    format: "B",
    slideCount: 3,
    population: "Open Male, season 8, valid + split_coverage ≥0.97, top/bottom deciles",
    sampleSize: "n=29,431 (top 10% + bottom 10%)",
    keyStatistic: "Bottom 10% finishers slow 72.5% from Run1 to Run8 — top 10% slow only 22.8%",
    supportingStatistics: ["Top 10%: 3:35 → 4:25 · Bottom 10%: 6:05 → 10:31"],
    interpretation: "The gap between a strong and weak finish isn't mainly who starts faster — it's who holds their pace.",
    caveat: "Correlational tiering by finish time, not a controlled pacing experiment.",
    calculatorMode: "analyse",
    ctaType: "soft",
    ctaText: "Predict your own pacing curve with the Forma HYROX Calculator.",
    sourceReference: `${SOURCE_DOC} §2.3, §4 Insight 3`,
    slides: [
      {
        component: "InsightHero",
        kicker: "CONSISTENCY LAB",
        headline: "It's not how you start. It's how you finish.",
        primaryStat: "72.5%",
        primaryStatSuffix: "SLOWDOWN, RUN1→RUN8, BOTTOM 10% FINISHERS",
        supportingText: "Top 10% finishers slow down only 22.8% over the same 8 runs.",
        sampleSizeText: "n=14,020 (top 10%) / n=15,411 (bottom 10%) · Forma 2025–26 dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see both pacing curves side by side",
      },
      {
        // Only Run1 and Run8 are sourced per-tier values (results doc §2.3) — the source data
        // doesn't report tiered pace for Runs 2-7, so this deliberately plots just the two real
        // anchor points rather than inventing a plausible-looking curve between them.
        component: "PaceProgression",
        kicker: "TOP 10% VS BOTTOM 10%",
        headline: "Run 1 vs. Run 8 pace, by finishing tier",
        legend: [
          { label: "Top 10%", color: "#22d3ee" },
          { label: "Bottom 10%", color: "#ef4444" },
        ],
        series: [
          {
            name: "Top 10%",
            color: "#22d3ee",
            points: [
              { x: 1, y: 215, label: "RUN 1" },
              { x: 2, y: 265, label: "RUN 8" },
            ],
          },
          {
            name: "Bottom 10%",
            color: "#ef4444",
            points: [
              { x: 1, y: 365, label: "RUN 1" },
              { x: 2, y: 631, label: "RUN 8" },
            ],
          },
        ],
        supportingText: "Two athletes, same starting line. One finishes strong, one falls apart — and it isn't the first kilometre that decides it.",
        sampleSizeText: "n=14,020 (top 10%) / n=15,411 (bottom 10%)",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "The difference isn't the first km. It's the last four. This is a pacing and conditioning story, not a talent story.",
        caveat: "Tiering by finish time is correlational, not a controlled pacing experiment.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "soft",
      },
    ],
    caption: `It's not how you start. It's how you finish.

We split Open Male finishers into the top and bottom 10% by overall time and compared their pacing curves. Top 10% finishers slow down 22.8% from Run 1 to Run 8. Bottom 10% finishers slow down 72.5% — more than three times as much.

Both groups start at different paces, sure. But the real story is the shape of the fade, not the starting line. Two athletes can start at the same relative effort — one holds it, one doesn't.

This is a pacing and conditioning story, not a talent story.

Analysis based on 29,431 Open Male results (top and bottom deciles) from the Forma 2025–26 worldwide HYROX dataset.

Predict your own pacing curve with the Forma HYROX Calculator, free at getforma.fit.

${HASHTAGS}`,
  },

  // ── 14 (insight 14) — richer carousel ───────────────────────────────────────────────────────
  {
    id: "014-age-effects",
    insightId: 14,
    postNumber: 14,
    title: "Your legs age slower than your strength",
    hook: "Your legs age slower than your strength",
    format: "C",
    slideCount: 4,
    population: "Open Male, season 8, valid + split_coverage ≥0.97, by age group",
    sampleSize: "n=140,625 across 10 age bands (16–24 through 65–69)",
    keyStatistic: "From 25–29 to 65–69: run time rose 20%, station time rose 37%",
    supportingStatistics: ["Performance is essentially flat from 16 to 39 (88–90 min)", "Station time overtakes run time as the bigger component from the mid-50s onward"],
    interpretation: "Strength/power on the stations appears to erode faster with age than aerobic running capacity.",
    caveat: "Cross-sectional data (different people at different ages, not the same athletes tracked over time) — shows association, not a guarantee about how any individual will age.",
    calculatorMode: "predict",
    ctaType: "soft",
    ctaText: "See how your age group typically performs — try Forma.",
    sourceReference: `${SOURCE_DOC} §2.8, §4`,
    slides: [
      {
        component: "InsightHero",
        kicker: "AGE-GROUP INTELLIGENCE",
        headline: "Your legs age slower than your strength",
        primaryStat: "+37%",
        primaryStatSuffix: "STATION TIME GROWTH, AGE 25–29 → 65–69",
        supportingText: "Run time over the same age range grew only 20%.",
        sampleSizeText: "n=140,625 Open Male across 10 age bands · Forma 2025–26 dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see running vs. stations by age",
      },
      {
        component: "PaceProgression",
        kicker: "GROWTH FROM 25–29 BASELINE",
        headline: "Run time vs. station time, indexed by age group",
        legend: [
          { label: "Run total", color: "#22d3ee" },
          { label: "Station total", color: "#fbbf24" },
        ],
        series: [
          {
            name: "Run total",
            color: "#22d3ee",
            points: [
              { x: 1, y: 100, label: "25–29" },
              { x: 2, y: 102, label: "35–39" },
              { x: 3, y: 105, label: "45–49" },
              { x: 4, y: 111, label: "55–59" },
              { x: 5, y: 120, label: "65–69" },
            ],
          },
          {
            name: "Station total",
            color: "#fbbf24",
            points: [
              { x: 1, y: 100, label: "25–29" },
              { x: 2, y: 102, label: "35–39" },
              { x: 3, y: 107, label: "45–49" },
              { x: 4, y: 119, label: "55–59" },
              { x: 5, y: 137, label: "65–69" },
            ],
          },
        ],
        supportingText: "Indexed to 100 at age 25–29. Station time (amber) pulls away from run time (cyan) after the mid-50s.",
        sampleSizeText: "n=140,625 Open Male across 10 age bands",
        ctaType: "none",
        swipePrompt: "Swipe to see the exact crossover point",
      },
      {
        component: "StatComparison",
        kicker: "THE CROSSOVER",
        headline: "Which is bigger — your run total or station total?",
        items: [
          { label: "AGE 25–29", value: "RUN LEADS", sub: "41:55 run vs 38:54 station", tone: "positive" },
          { label: "AGE 65–69", value: "STATION LEADS", sub: "50:16 run vs 53:27 station", tone: "amber" },
        ],
        supportingText: "By the late 60s, station time has overtaken running as the bigger half of the race — the reverse of every younger age group.",
        sampleSizeText: "n=419 (65–69) / n=26,044 (25–29)",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Strength and power on the stations appear to erode faster with age than aerobic running capacity does.",
        caveat: "Cross-sectional data — different people at different ages, not the same athletes tracked over time. Shows association, not a guarantee for any individual.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "soft",
      },
    ],
    caption: `Your legs age slower than your strength.

We compared run time and station time across 10 age bands of Open Male finishers, from 16–24 up to 65–69. Performance is essentially flat through the 20s and 30s (88–90 minutes), then rises steadily.

The more interesting pattern is in what's driving that rise. From age 25–29 to 65–69, run time increased 20%. Station time increased 37% — nearly double the rate. By the mid-50s, station time actually overtakes run time as the bigger half of the race, reversing the pattern seen in every younger age group.

Strength and power on the stations appear to fade faster with age than aerobic running capacity. This is cross-sectional data — different people at different ages, not the same athletes tracked over years — so it's an association, not a promise about how any one person will age.

Analysis based on 140,625 Open Male results across 10 age bands from the Forma 2025–26 worldwide HYROX dataset.

See how your own age group typically performs — try the Forma HYROX Calculator free at getforma.fit.

${HASHTAGS}`,
  },

  // ── 15 (insight 4) — flagship, direct CTA ───────────────────────────────────────────────────
  {
    id: "015-sub75-vs-sub80-decomposition",
    insightId: 4,
    postNumber: 15,
    title: "The 5 minutes between 75 and 80 isn't what you think",
    hook: "The 5 minutes between 75 and 80 isn't what you think",
    format: "C",
    slideCount: 5,
    population: "Open Male, season 8, valid + split_coverage ≥0.97, 70–75 and 75–80 bands",
    sampleSize: "n=31,300 (70–75 and 75–80 bands combined)",
    keyStatistic: "The 4:53 gap between 70–75 and 75–80 splits 43.8% running / 44.8% stations / 11.2% RoxZone",
    supportingStatistics: ["This ~44/45/11 split repeats within a few points across every adjacent band from sub-60 to 90–100"],
    interpretation: "Most athletes assume the gap between time brackets is dominated by one lever. The data says it's close to a coin flip between running and stations, with RoxZone consistently worth about a tenth of it.",
    caveat: "Averages across a band — any individual athlete's own 5-minute gap could be running-dominated or station-dominated.",
    calculatorMode: "target",
    ctaType: "direct",
    ctaText: "Find out exactly where your 5 minutes are — Hit a Target Time with Forma.",
    sourceReference: `${SOURCE_DOC} §2.6, §4 Insight 4`,
    slides: [
      {
        component: "InsightHero",
        kicker: "HIT A TARGET TIME",
        headline: "The 5 minutes between 75 and 80 isn't what you think",
        primaryStat: "4:53",
        primaryStatSuffix: "AVERAGE GAP, 70–75 MIN BAND VS 75–80 MIN BAND",
        supportingText: "Where does that time actually come from?",
        sampleSizeText: "n=31,300 Open Male · Forma 2025–26 worldwide dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see the breakdown",
      },
      {
        component: "ThresholdComparison",
        kicker: "DECOMPOSING THE GAP",
        headline: "70–75 min → 75–80 min: where the 4:53 comes from",
        bandLabel: "The gap between adjacent bands",
        totalLabel: "4:53 total",
        segments: [
          { name: "Running", value: 43.8, pctLabel: "44% RUN", color: "#22d3ee" },
          { name: "Stations", value: 44.8, pctLabel: "45% STATIONS", color: "#fbbf24" },
          { name: "RoxZone", value: 11.2, pctLabel: "11%", color: "#ef4444" },
        ],
        legend: [
          { label: "Running", color: "#22d3ee" },
          { label: "Stations", color: "#fbbf24" },
          { label: "RoxZone", color: "#ef4444" },
        ],
        supportingText: "Almost exactly a 50/50 split between running and stations — not the one-big-lever story most athletes expect.",
        sampleSizeText: "n=13,938 (70–75) / n=17,362 (75–80)",
        ctaType: "none",
        swipePrompt: "Swipe to see if this pattern holds at every level",
      },
      {
        component: "ThresholdComparison",
        kicker: "NOT A ONE-OFF",
        headline: "The same ~44/45/11 split holds at every level",
        bandLabel: "80–90 min → 90–100 min band gap",
        totalLabel: "9:45 total",
        segments: [
          { name: "Running", value: 41.6, pctLabel: "42% RUN", color: "#22d3ee" },
          { name: "Stations", value: 45.9, pctLabel: "46% STATIONS", color: "#fbbf24" },
          { name: "RoxZone", value: 12.7, pctLabel: "13%", color: "#ef4444" },
        ],
        legend: [
          { label: "Running", color: "#22d3ee" },
          { label: "Stations", color: "#fbbf24" },
          { label: "RoxZone", color: "#ef4444" },
        ],
        supportingText: "This pattern repeats within a few points across every adjacent band from sub-60 through 90–100 — it's systematic, not a one-off at 75/80.",
        sampleSizeText: "n=34,435 (80–90) / n=24,776 (90–100)",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "Most athletes assume the gap between time brackets is dominated by one thing — usually 'get fitter' or 'get stronger.' The data says it's close to a coin flip, with RoxZone consistently worth about a tenth of it.",
        caveat: "These are averages across a band — your own 5-minute gap could be running-dominated or station-dominated.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
        swipePrompt: "Swipe to find your own 5 minutes",
      },
      {
        component: "InsightCTA",
        headline: "Find out exactly where your 5 minutes are",
        bullets: [
          "See your run vs. station vs. RoxZone breakdown",
          "Compare against your specific target band",
          "Know exactly what to train, not just that you should",
        ],
        buttonText: "HIT A TARGET TIME",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
      },
    ],
    caption: `The 5 minutes between 75 and 80 isn't what you think.

We took every Open Male result in the 70–75 and 75–80 minute bands (31,300 races) and decomposed the average 4:53 gap between them into running, stations, and RoxZone. The split: 43.8% running, 44.8% stations, 11.2% RoxZone — almost exactly a coin flip between the two big levers, with RoxZone consistently worth about a tenth.

We checked whether this was a one-off at the 75/80 line specifically. It isn't — the same ~44/45/11 pattern holds within a few points across every adjacent performance band, from sub-60 all the way to 90–100 minutes.

Most athletes assume the gap between brackets comes down to one thing: get fitter, or get stronger. The data says it's rarely that simple — and knowing which half of your own gap is running vs. stations is far more useful than a generic "train harder."

Analysis based on 31,300 Open Male results from the Forma 2025–26 worldwide HYROX dataset.

Find out exactly where your 5 minutes are — hit a target time free with the Forma HYROX Calculator at getforma.fit.

${HASHTAGS}`,
  },

  // ── HELD BACK — post 16 (insight 15), for post-launch publishing ───────────────────────────
  {
    id: "016-pro-loads-stations-matter-more",
    insightId: 15,
    postNumber: 16,
    heldBack: true,
    title: "Heavier loads don't shrink the stations' share of your race",
    hook: "Heavier loads don't shrink the stations' share of your race",
    format: "B",
    slideCount: 3,
    population: "Open Male/Female + Pro Male/Female, season 8, valid + split_coverage ≥0.97",
    sampleSize: "n=140,133 (Open M) / n=23,349 (Pro M) / n=84,038 (Open F) / n=10,535 (Pro F)",
    keyStatistic: "Stations consume a larger share of a Pro athlete's race than an Open athlete's (46.7% vs 44.0%, men)",
    supportingStatistics: ["Women: 45.9% (Pro) vs 43.1% (Open)", "Field competitiveness (spread) is nearly identical across all four groups (~21–22% CV)"],
    interpretation: "As station demand rises with Pro's heavier loads, strength/power work claims more of the race, not less.",
    caveat: "Doesn't measure whether Pro athletes train stations more — only how race time is distributed once you're racing at that load.",
    calculatorMode: "target",
    ctaType: "none",
    ctaText: null,
    sourceReference: `${SOURCE_DOC} §2.10`,
    slides: [
      {
        component: "InsightHero",
        kicker: "PRO VS OPEN",
        headline: "Heavier loads don't shrink the stations' share of your race",
        primaryStat: "46.7%",
        primaryStatSuffix: "OF A PRO MALE RACE IS STATIONS, VS 44.0% IN OPEN",
        supportingText: "Counter to the assumption that the fastest athletes are just great runners.",
        sampleSizeText: "n=140,133 (Open M) / n=23,349 (Pro M) · Forma 2025–26 dataset",
        ctaType: "none",
        swipePrompt: "Swipe to see Open vs. Pro, both sexes",
      },
      {
        component: "StatComparison",
        kicker: "STATION SHARE OF TOTAL RACE TIME",
        headline: "Open vs. Pro, both sexes",
        items: [
          { label: "OPEN MALE", value: "44.0%", sub: "median 87:07", tone: "positive" },
          { label: "PRO MALE", value: "46.7%", sub: "median 80:17", tone: "amber" },
          { label: "OPEN FEMALE", value: "43.1%", sub: "median 96:11", tone: "positive" },
        ],
        supportingText: "Pro female sits at 45.9% — the same pattern as the men's field.",
        sampleSizeText: "n=140,133 / n=23,349 / n=84,038 / n=10,535",
        ctaType: "none",
      },
      {
        component: "AthleteTakeaway",
        text: "As the physical demand of the stations rises with Pro's heavier loads, strength and power work claims more of the race, not less.",
        caveat: "This measures how race time is distributed at that load — not whether Pro athletes train stations more than Open athletes do.",
        sampleSizeText: "Forma 2025–26 worldwide HYROX dataset",
        ctaType: "none",
      },
    ],
    caption: `Heavier loads don't shrink the stations' share of your race.

Pro athletes race with heavier station loads and are meaningfully faster overall — but stations actually consume a larger share of a Pro athlete's race than an Open athlete's: 46.7% vs. 44.0% for men, 45.9% vs. 43.1% for women.

It's tempting to assume the fastest athletes in a race are just excellent runners. The data says that as the physical demand of the stations rises, strength and power work claims more of the total race time, not less.

Worth noting: field competitiveness — how spread out the times are — is remarkably similar across Open and Pro, around 21–22% either way. Different pace, same shape of competition.

Analysis based on 140,133 Open Male, 23,349 Pro Male, 84,038 Open Female and 10,535 Pro Female results from the Forma 2025–26 worldwide HYROX dataset.

${HASHTAGS}`,
  },
];

export const LAUNCH_POSTS = POSTS.filter((p) => !p.heldBack);
export const HELD_BACK_POSTS = POSTS.filter((p) => p.heldBack);
