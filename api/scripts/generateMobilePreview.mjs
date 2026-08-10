// Generates a self-contained HTML QA contact sheet for every rendered Forma Data Lab post:
// mobile feed previews at 390 / 375 / 360px, first-slide profile-grid crops, representative
// crop-safe overlays, and before/after examples when a before snapshot exists.
//
// Usage:
//   node scripts/generateInsightPosts.mjs --held-back
//   node scripts/generateMobilePreview.mjs
//
// Optional before snapshot:
//   copy rendered post directories into docs/social/insights/2025-26/_qa/before-post-audit/
//   before editing, then rerun this script after regeneration.

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_script = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname_script, "../../docs/social/insights/2025-26");
const OUT_DIR = join(ROOT, "_qa");
const OUT_FILE = join(OUT_DIR, "mobile-preview.html");
const BEFORE_DIR = join(OUT_DIR, "before-post-audit");
const WIDTHS = [390, 375, 360];

const OVERLAY_EXAMPLES = [
  { postNumber: 1, slide: "slide-01.png", reason: "launch hero" },
  { postNumber: 2, slide: "slide-01.png", reason: "carousel first slide" },
  { postNumber: 2, slide: "slide-02.png", reason: "chart-heavy" },
  { postNumber: 14, slide: "slide-02.png", reason: "chart-heavy later post" },
  { postNumber: 15, slide: "slide-02.png", reason: "comparison-heavy later post" },
];

const BEFORE_AFTER_EXAMPLES = [
  { postNumber: 1, slide: "slide-01.png", reason: "Post 1 L2 support copy" },
  { postNumber: 2, slide: "slide-01.png", reason: "Post 2 shorter support copy" },
  { postNumber: 2, slide: "slide-02.png", reason: "Post 2 chart interpretation" },
  { postNumber: 2, slide: "slide-03.png", reason: "Post 2 hierarchy and caveat" },
  { postNumber: 14, slide: "slide-02.png", reason: "chart-heavy later post" },
  { postNumber: 15, slide: "slide-02.png", reason: "comparison-heavy later post" },
];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadPosts() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
    .map((e) => e.name)
    .sort();

  const posts = [];
  for (const dir of dirs) {
    const metaPath = join(ROOT, dir, "metadata.json");
    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8"));
    } catch {
      continue;
    }
    const slides = (await readdir(join(ROOT, dir))).filter((f) => /^slide-\d+\.png$/.test(f)).sort();
    posts.push({ dir, meta, slides });
  }
  return posts;
}

function findPostByNumber(posts, postNumber) {
  return posts.find((p) => Number(p.meta.postNumber) === Number(postNumber));
}

function slideCard(dir, filename, index, slideCount) {
  const src = `../${dir}/${filename}`;
  const frames = WIDTHS.map(
    (w) => `<div class="frame" style="width:${w}px;">
      <div class="frame-label">${w}px</div>
      <img src="${src}" alt="slide ${index + 1}" style="width:${w}px;height:${Math.round((w * 1350) / 1080)}px;" />
    </div>`,
  ).join("");

  return `<div class="slide-block">
    <div class="slide-title">Slide ${index + 1}${slideCount > 1 ? ` / ${slideCount}` : ""}</div>
    <div class="frame-row">${frames}</div>
  </div>`;
}

function postSection(post) {
  const { dir, meta, slides } = post;
  const heldBackBadge = meta.heldBack ? `<span class="badge">HELD BACK</span>` : "";
  const slideCards = slides.map((f, i) => slideCard(dir, f, i, slides.length)).join("");
  return `<section class="post" id="post-${meta.postNumber}">
    <h2>Post ${meta.postNumber} - ${escapeHtml(meta.title)} ${heldBackBadge}</h2>
    <div class="post-meta">${escapeHtml(meta.sampleSize ?? "")} / ${escapeHtml(dir)}</div>
    <div class="slides">${slideCards}</div>
  </section>`;
}

function gridSection(posts) {
  const tiles = posts
    .map((post) => `<figure class="grid-tile">
      <img src="../${post.dir}/${post.slides[0]}" alt="Post ${post.meta.postNumber} first-slide square crop" />
      <figcaption>${post.meta.postNumber}</figcaption>
    </figure>`)
    .join("");

  return `<section class="qa-section" id="profile-grid">
    <h2>First-Slide Profile Grid Crop</h2>
    <div class="post-meta">Centered 1:1 crop preview of every Post 1-16 first slide. Primary hook, brand, and key stat should survive the square grid crop.</div>
    <div class="profile-grid">${tiles}</div>
  </section>`;
}

function overlayCard(post, filename, reason) {
  return `<div class="overlay-card">
    <div class="slide-title">Post ${post.meta.postNumber} / ${escapeHtml(reason)} / ${filename}</div>
    <div class="crop-frame">
      <img src="../${post.dir}/${filename}" alt="Post ${post.meta.postNumber} crop overlay" />
      <div class="profile-crop"></div>
      <div class="critical-top"></div>
      <div class="inset-left"></div>
      <div class="inset-right"></div>
    </div>
    <div class="legend-row"><span class="cyan-line"></span> 1:1 profile crop <span class="amber-line"></span> y=145 critical top <span class="white-line"></span> 72px horizontal inset</div>
  </div>`;
}

function overlaySection(posts) {
  const cards = OVERLAY_EXAMPLES.map((example) => {
    const post = findPostByNumber(posts, example.postNumber);
    if (!post || !post.slides.includes(example.slide)) return "";
    return overlayCard(post, example.slide, example.reason);
  }).join("");

  return `<section class="qa-section" id="crop-overlays">
    <h2>Representative Crop Overlays</h2>
    <div class="post-meta">Profile crop is the centered 1080x1080 square, native y=135. The amber line marks critical-content top at y=145; white lines mark the 72px horizontal inset.</div>
    <div class="overlay-grid">${cards}</div>
  </section>`;
}

async function beforeAfterSection(posts) {
  if (!(await pathExists(BEFORE_DIR))) {
    return `<section class="qa-section" id="before-after"><h2>Before / After Examples</h2><div class="post-meta">No before snapshot found at _qa/before-post-audit.</div></section>`;
  }

  const pairs = [];
  for (const example of BEFORE_AFTER_EXAMPLES) {
    const post = findPostByNumber(posts, example.postNumber);
    if (!post || !post.slides.includes(example.slide)) continue;
    if (!(await pathExists(join(BEFORE_DIR, post.dir, example.slide)))) continue;
    pairs.push(`<div class="ba-card">
      <div class="slide-title">Post ${post.meta.postNumber} / ${escapeHtml(example.reason)}</div>
      <div class="ba-row">
        <figure><figcaption>Before</figcaption><img src="before-post-audit/${post.dir}/${example.slide}" alt="before Post ${post.meta.postNumber}" /></figure>
        <figure><figcaption>After</figcaption><img src="../${post.dir}/${example.slide}" alt="after Post ${post.meta.postNumber}" /></figure>
      </div>
    </div>`);
  }

  return `<section class="qa-section" id="before-after">
    <h2>Before / After Examples</h2>
    <div class="post-meta">Representative slides required by the audit: Post 1, Post 2, one chart-heavy later post, and one comparison-heavy later post.</div>
    <div class="before-after-grid">${pairs.join("")}</div>
  </section>`;
}

async function main() {
  const posts = await loadPosts();
  const beforeAfter = await beforeAfterSection(posts);
  const sections = posts.map(postSection).join("\n");
  const nav = posts.map((p) => `<a href="#post-${p.meta.postNumber}">${p.meta.postNumber}</a>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Forma Data Lab - Instagram QA</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #06101e; color: #f0f6ff; font-family: -apple-system, "Segoe UI", Inter, Arial, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
  .nav { position: sticky; top: 0; background: #06101eee; backdrop-filter: blur(4px); padding: 10px 0; margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 10; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .nav a { color: #22d3ee; text-decoration: none; font-size: 13px; font-weight: 700; border: 1px solid rgba(34,211,238,0.4); border-radius: 5px; padding: 4px 8px; }
  .nav a:hover { background: rgba(34,211,238,0.12); }
  section.post, .qa-section { margin-bottom: 56px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); }
  h2 { font-size: 17px; margin: 16px 0 2px; }
  .badge { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; color: #fbbf24; border: 1px solid #fbbf24; border-radius: 4px; padding: 2px 6px; margin-left: 8px; vertical-align: middle; }
  .post-meta { color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
  .slide-block { margin-bottom: 28px; }
  .slide-title { font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .frame-row { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .frame { flex-shrink: 0; }
  .frame-label { font-size: 11px; color: #475569; margin-bottom: 4px; }
  .frame img { display: block; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); }
  .profile-grid { display: grid; grid-template-columns: repeat(4, 220px); gap: 18px; align-items: start; }
  .grid-tile { margin: 0; position: relative; width: 220px; height: 220px; overflow: hidden; border: 1px solid rgba(255,255,255,0.16); border-radius: 4px; background: #000; }
  .grid-tile img { width: 220px; height: 220px; object-fit: cover; object-position: center; display: block; }
  .grid-tile figcaption { position: absolute; left: 8px; bottom: 8px; background: #06101ecc; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; padding: 2px 6px; font-size: 12px; font-weight: 800; }
  .overlay-grid, .before-after-grid { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .crop-frame { position: relative; width: 360px; height: 450px; }
  .crop-frame img { width: 360px; height: 450px; display: block; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; }
  .profile-crop { position: absolute; left: 0; top: 45px; width: 360px; height: 360px; border: 2px solid #22d3ee; pointer-events: none; }
  .critical-top { position: absolute; left: 0; right: 0; top: 48px; height: 0; border-top: 2px dashed #fbbf24; pointer-events: none; }
  .inset-left, .inset-right { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed rgba(255,255,255,0.82); pointer-events: none; }
  .inset-left { left: 24px; }
  .inset-right { right: 24px; }
  .legend-row { color: #94a3b8; font-size: 12px; margin-top: 8px; max-width: 360px; line-height: 1.5; }
  .cyan-line, .amber-line, .white-line { display: inline-block; width: 18px; height: 0; vertical-align: middle; margin: 0 4px 0 10px; }
  .cyan-line { border-top: 2px solid #22d3ee; }
  .amber-line { border-top: 2px dashed #fbbf24; }
  .white-line { border-top: 2px dashed rgba(255,255,255,0.82); }
  .ba-card { width: 760px; }
  .ba-row { display: flex; gap: 16px; }
  .ba-row figure { margin: 0; }
  .ba-row figcaption { font-size: 12px; color: #94a3b8; margin-bottom: 5px; font-weight: 800; text-transform: uppercase; }
  .ba-row img { width: 360px; height: 450px; display: block; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); }
</style>
</head>
<body>
<h1>Forma Data Lab - Instagram QA</h1>
<div class="sub">Every slide rendered at realistic Instagram feed widths (390 / 375 / 360px), plus grid crops, overlays, and before/after checks. Generated ${new Date().toISOString().slice(0, 10)}.</div>
<nav class="nav"><a href="#profile-grid">Grid</a><a href="#crop-overlays">Overlays</a><a href="#before-after">Before/After</a>${nav}</nav>
${gridSection(posts)}
${overlaySection(posts)}
${beforeAfter}
${sections}
</body>
</html>`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, html, "utf8");
  console.log(`Wrote ${posts.length} post(s), ${posts.reduce((n, p) => n + p.slides.length, 0)} slide(s) -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
