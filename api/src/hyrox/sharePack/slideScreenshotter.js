import { SLIDE_IDS } from "./slideAssets.js";

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
    // Use domcontentloaded — the carousel page is self-contained with no external resources
    await page.setContent(carouselHtml, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Allow inline scripts to finish rendering before screenshotting
    await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));

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
