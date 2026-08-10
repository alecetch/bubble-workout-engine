import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SLIDE_IDS } from "./slideAssets.js";

// Resolve the project-root assets/ dir regardless of CWD
const ASSETS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../assets");

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
];

// Shared launcher so callers that render more than one asset per request (e.g. a full share
// pack's 6 slides + race card) can pool a single Chrome instance instead of launching one per
// asset — see sharePackService.js's getOrCreateSharePack for the pooled call site.
export async function launchBrowser() {
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ args: LAUNCH_ARGS, headless: true });
}

// Replace /assets/... paths embedded in the carousel JSON with base64 data URIs so
// Puppeteer's setContent() can render them without needing a live HTTP server.
async function inlineAssetPaths(html) {
  const seen = new Set();
  const matches = [...html.matchAll(/"(\/assets\/[^"]+\.png)"/g)];
  for (const [, assetPath] of matches) {
    if (seen.has(assetPath)) continue;
    seen.add(assetPath);
    const filePath = join(ASSETS_ROOT, assetPath.replace(/^\/assets\//, ""));
    try {
      const data = await readFile(filePath);
      const dataUri = `data:image/png;base64,${data.toString("base64")}`;
      html = html.replaceAll(`"${assetPath}"`, `"${dataUri}"`);
    } catch {
      // File missing — CSS hides the img when src is empty, so this is graceful
    }
  }
  return html;
}

/**
 * Screenshots a self-contained HTML string and returns a PNG Buffer.
 * Uses deviceScaleFactor 2 for retina-crisp output; the returned buffer is
 * at the logical (CSS) dimensions, not doubled.
 *
 * @param {string} htmlString  Fully self-contained HTML (fonts/images already inline or loaded via network)
 * @param {{ width: number, height: number }} dims
 * @param {import('puppeteer').Browser|null} sharedBrowser  Optional pre-launched browser to reuse
 *   instead of launching (and closing) a new one — see launchBrowser().
 * @returns {Promise<Buffer>}
 */
export async function screenshotHtml(htmlString, { width, height }, sharedBrowser = null) {
  const browser = sharedBrowser ?? (await launchBrowser());
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(htmlString, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
      timeout: 30000,
    });
    return Buffer.from(buf);
  } finally {
    await page?.close();
    if (!sharedBrowser) await browser.close();
  }
}

export async function screenshotSlides(carouselHtml, sharedBrowser = null) {
  const browser = sharedBrowser ?? (await launchBrowser());
  let page;
  try {
    page = await browser.newPage();
    // 6 slides * 1350px (Phase 10 migration, was 1080px) + 5 * 28px gaps + 2 * 28px .carousel
    // padding = 8296px; rounded up with headroom so a future slide-height bump doesn't silently
    // clip the last slide(s) out of the rendered layout viewport.
    await page.setViewport({ width: 1080, height: 8500 });
    const inlinedHtml = await inlineAssetPaths(carouselHtml);
    await page.setContent(inlinedHtml, { waitUntil: "load", timeout: 30000 });
    // Small buffer so layout is computed before screenshotting; rAF is unreliable
    // in headless Chrome with --disable-gpu so use setTimeout instead
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const buffers = [];
    for (const slideId of SLIDE_IDS) {
      const el = await page.$(`[data-slide="${slideId}"]`);
      if (!el) throw new Error(`Slide ${slideId} not found in carousel HTML`);
      const buf = await el.screenshot({ type: "png", timeout: 30000 });
      buffers.push(Buffer.from(buf));
    }
    return buffers;
  } finally {
    await page?.close();
    if (!sharedBrowser) await browser.close();
  }
}
