// Renders the Forma HYROX data-insight Instagram post library to PNG + caption + metadata files.
//
// Reuses the existing screenshotHtml()/launchBrowser() Puppeteer pipeline from
// src/hyrox/sharePack/slideScreenshotter.js (the same renderer that produces the live race card
// and athlete carousel) — nothing about that pipeline is modified. This script is purely additive:
// new content, new templates (src/hyrox/reports/insightPosts/), same renderer.
//
// Usage: node scripts/generateInsightPosts.mjs [--post=<id>] [--held-back]
//   --post=<id>    render only one post (by its `id`, e.g. --post=001-sub75-rarity)
//   --held-back    also render the 1 held-back post (excluded by default)
//
// Output: docs/social/insights/2025-26/{postNumber-slug}/slide-NN.png, caption.txt, metadata.json
// docs/ is already gitignored (see .gitignore:122) so these generated binaries are never committed.

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, screenshotHtml } from "../src/hyrox/sharePack/slideScreenshotter.js";
import { slideDocument, CANVAS } from "../src/hyrox/reports/insightPosts/theme.js";
import * as components from "../src/hyrox/reports/insightPosts/components.js";
import { POSTS, LAUNCH_POSTS, HELD_BACK_POSTS } from "../src/hyrox/reports/insightPosts/postDefinitions.js";

const __dirname_script = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = join(__dirname_script, "../../docs/social/insights/2025-26");

function parseArgs(argv) {
  const opts = { post: null, heldBack: false };
  for (const arg of argv) {
    if (arg === "--held-back") opts.heldBack = true;
    else if (arg.startsWith("--post=")) opts.post = arg.slice("--post=".length);
  }
  return opts;
}

function postDirName(post) {
  const n = String(post.postNumber).padStart(3, "0");
  return `${n}-${post.id.replace(/^\d+-/, "")}`;
}

function slideFilename(index) {
  const n = String(index + 1).padStart(2, "0");
  return `slide-${n}.png`;
}

async function renderPost(post, browser) {
  const dir = join(OUTPUT_ROOT, postDirName(post));
  await mkdir(dir, { recursive: true });

  for (let i = 0; i < post.slides.length; i++) {
    const spec = post.slides[i];
    const build = components[spec.component];
    if (typeof build !== "function") {
      throw new Error(`Post ${post.id} slide ${i + 1}: unknown component "${spec.component}"`);
    }
    const bodyHtml = build(spec);
    const html = slideDocument(bodyHtml, { title: `${post.title} — Forma HYROX Data` });
    const png = await screenshotHtml(html, CANVAS, browser);
    const filename = slideFilename(i);
    await writeFile(join(dir, filename), png);
  }

  await writeFile(join(dir, "caption.txt"), post.caption, "utf8");

  const metadata = {
    id: post.id,
    insightId: post.insightId,
    postNumber: post.postNumber,
    heldBack: Boolean(post.heldBack),
    title: post.title,
    hook: post.hook,
    format: post.format,
    slideCount: post.slideCount,
    population: post.population,
    sampleSize: post.sampleSize,
    keyStatistic: post.keyStatistic,
    supportingStatistics: post.supportingStatistics,
    interpretation: post.interpretation,
    caveat: post.caveat,
    calculatorMode: post.calculatorMode,
    ctaType: post.ctaType,
    ctaText: post.ctaText,
    sourceReference: post.sourceReference,
    slides: post.slides.map((s, i) => ({
      index: i + 1,
      component: s.component,
      filename: slideFilename(i),
    })),
  };
  await writeFile(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

  return { dir, slideCount: post.slides.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let targets = opts.heldBack ? POSTS : LAUNCH_POSTS;
  if (opts.post) {
    targets = POSTS.filter((p) => p.id === opts.post);
    if (targets.length === 0) {
      console.error(`No post found with id "${opts.post}". Available ids:\n${POSTS.map((p) => `  ${p.id}`).join("\n")}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`Rendering ${targets.length} post(s) to ${OUTPUT_ROOT}`);
  const browser = await launchBrowser();
  try {
    for (const post of targets) {
      const { dir, slideCount } = await renderPost(post, browser);
      console.log(`  [OK] ${post.id} — ${slideCount} slide(s) -> ${dir}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`Done. ${opts.heldBack || opts.post ? "" : `(${HELD_BACK_POSTS.length} held-back post(s) skipped — pass --held-back to include)`}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
