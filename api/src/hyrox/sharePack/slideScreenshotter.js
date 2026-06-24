import { SLIDE_IDS } from "./slideAssets.js";

export async function screenshotSlides(carouselHtml) {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    headless: "new",
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 7000 });
    await page.setContent(carouselHtml, { waitUntil: "networkidle0" });

    const buffers = [];
    for (const slideId of SLIDE_IDS) {
      const el = await page.$(`[data-slide="${slideId}"]`);
      if (!el) throw new Error(`Slide ${slideId} not found in carousel HTML`);
      const buf = await el.screenshot({ type: "png" });
      buffers.push(Buffer.from(buf));
    }
    return buffers;
  } finally {
    await browser.close();
  }
}
