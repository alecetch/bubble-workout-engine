import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SLIDE_IDS } from "./slideAssets.js";

// Resolve the project-root assets/ dir regardless of CWD
const ASSETS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../assets");

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

export async function screenshotSlides(carouselHtml) {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
    ],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 7000 });
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
    await browser.close();
  }
}
