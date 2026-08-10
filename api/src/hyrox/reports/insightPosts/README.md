# Forma HYROX Data-Insight Post System

Generates the Forma Instagram "data insight" post library — editorial content about the HYROX
dataset as a whole (e.g. "the run where athletes fall apart"), as distinct from the athlete-personal
race card / carousel system in `../raceCardBuilder.js` and `../carouselPageBuilder.js`, which this
module does not modify, import from, or depend on.

Background: `docs/planning/instagram-hooks-analyse-results.md` (the 17-insight analysis) →
`docs/planning/instagram-hooks-posts-plan.md` (format/order decisions) → this module (implementation).

## How it works

```
postDefinitions.js   structured data for every post (Phase 12 schema: id, insightId, population,
                      sampleSize, key statistic, caveat, calculatorMode, ctaType, slides[], caption)
        │
        ▼
components.js         8 reusable slide layouts (InsightHero, StatComparison, RankedBars,
                      PaceProgression, ThresholdComparison, DistributionCard, AthleteTakeaway,
                      InsightCTA) — each takes a slide spec object, returns an HTML fragment
        │
        ▼
theme.js               shared design tokens (colors/fonts/logo/footer), copied from the same
                      values as raceCardBuilder.js so posts look like the same Forma product —
                      wraps a component's HTML fragment into a full 1080x1350 document
        │
        ▼
../../sharePack/slideScreenshotter.js   the EXISTING Puppeteer renderer (screenshotHtml()) —
                                         reused unmodified; this is the same function that
                                         renders the live race card
        │
        ▼
docs/social/insights/2025-26/{postNumber-slug}/slide-NN.png, caption.txt, metadata.json
```

`docs/` is already gitignored (see `.gitignore:122`), so generated PNGs are never committed —
re-run the generator any time to reproduce them.

## Generating assets

```
cd api
node scripts/generateInsightPosts.mjs                    # 15 launch posts (default)
node scripts/generateInsightPosts.mjs --held-back         # + the 1 held-back post (16 total)
node scripts/generateInsightPosts.mjs --post=004-sandbag-lunge-spread   # one post only
node scripts/lintTypography.mjs                           # semantic typography floor
node scripts/generateMobilePreview.mjs                    # mobile/grid/crop QA sheet
```

Requires Puppeteer (already an `api/` dependency) and a machine that can launch headless Chrome —
same requirement as the existing race-card/carousel generation, no new infrastructure.

## Adding a new insight as a post

1. **Find or produce the insight.** It needs a real, sourced number — same evidentiary bar as the
   17 in `instagram-hooks-analyse-results.md` (population, sample size, the actual query result).
2. **Add an entry to `postDefinitions.js`.** Pick the smallest format that tells the story honestly:
   - One dominant stat, nothing else needed → Format A, a single `InsightHero` slide.
   - A straightforward comparison or ranking → Format B, 3 slides (hook → data → `AthleteTakeaway`).
   - A genuinely multi-part story (e.g. a decomposition that needs two comparisons) → Format C,
     4–5 slides. Don't pad past what the insight needs — the account brief for this project (Phase 3
     of `instagram-hooks-analyse-create-posts.txt`) is explicit that slide count should be justified,
     not maximized.
   - Always fill `caveat` if the finding has one (confounds, correlation-not-causation, small-sample
     caveats) — it should show up on the slide, not just live in this file.
3. **Pick a `component` per slide** from the 8 in `components.js`. If none fit, that's a signal a
   9th reusable component is needed — write one more general-purpose component, not a bespoke
   one-off template. Keep new components consistent with the shared tokens in `theme.js` (don't
   introduce new colors/fonts).
4. **Classify the CTA** (`none` / `soft` / `direct`) per the brief's Phase 10 guidance — most posts
   should carry no CTA or a soft one; reserve `direct` for posts that land squarely on one of the
   three calculator modes (`analyse` / `predict` / `target`).
5. **Write the caption** following the Phase 14 structure: opening hook (1 sentence) → what the data
   shows (2–4 short paragraphs) → why it matters → data note (exact sample size + "Forma 2025–26
   worldwide HYROX dataset") → CTA where appropriate. Reuse the shared `HASHTAGS` constant rather
   than inventing a new tag set per post.
6. **Render it**: `node scripts/generateInsightPosts.mjs --post=<your-new-id>`, then open the PNGs
   and check the Phase 19 QA list below before publishing.
7. **Run mobile/grid QA**: `node scripts/lintTypography.mjs`, then
   `node scripts/generateMobilePreview.mjs`. Open
   `docs/social/insights/2025-26/_qa/mobile-preview.html` and check the 390/375/360 feed previews,
   first-slide square grid crop, representative crop overlays, and before/after examples.

## QA checklist (Phase 19 of the brief)

- [ ] Every number on the slide matches the sourced insight exactly — no rounding drift, no invented stats
- [ ] `sampleSizeText` on every slide states the real filtered population size, not a generic "600,000+"
- [ ] Caveat text is present on the slide (not just in `postDefinitions.js`) if the insight has one
- [ ] No text overflow, no clipped labels — open the PNG at full size, don't just trust the HTML
- [ ] Footer CTA microcopy matches the post's declared `ctaType`
- [ ] `www.getforma.fit` (not `forma.fit`) — the one canonical URL string across the whole system
- [ ] Caption's data note sample size matches the slide's sample size

## Instagram readability QA

- [ ] Meaningful text is readable at 390/375/360px feed widths
- [ ] Slide 1 survives the centered 1:1 Instagram profile-grid crop
- [ ] Representative crop overlays keep critical content under the y=145 line and inside 72px gutters
- [ ] Shared safe-area and typography rules match `docs/instagram/INSTAGRAM_STANDARDS.md`

## Traceability

Every stat on every post traces: **post → insight definition (`postDefinitions.js`, `sourceReference`
field) → query (`docs/planning/hyrox-instagram-analysis-queries.sql`) → dataset
(`hyrox_doubles_scraped_results`) → result (`instagram-hooks-analyse-results.md`)**. If a number here
doesn't match the source doc, the source doc is authoritative — fix this file, not the other way round.

## Relationship to Content Studio

`api/src/contentStudio/` is a separate, larger, unfinished system for *athlete-specific* editorial
content (spotlights, head-to-heads, myth-busting about a specific race). It has no visual renderer at
all today. This module deliberately does not attempt to unify with it — see
`instagram-hooks-analyse-results.md` §8 for the recommendation on how population-level insights (this
module) and athlete-specific insights (Content Studio) should eventually share one insight-engine
schema, once Content Studio is actually implemented.

## What was NOT changed

Nothing in `../raceCardBuilder.js`, `../carouselPageBuilder.js`, `../../sharePack/*`, or any other
production file was modified. This module only adds new files. The existing test suites
(`raceCardBuilder.test.js`, `carouselPageBuilder.test.js`, 55 tests total) pass unchanged.
