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
    // Inject base URL so /assets/... paths resolve against the local Express server
    const port = process.env.PORT ?? 3000;
    const baseTag = `<base href="http://localhost:${port}">`;
    const htmlWithBase = carouselHtml.replace("<head>", `<head>${baseTag}`);
    // waitUntil: "load" fires after images load — critical for the athlete hero image
    await page.setContent(htmlWithBase, { waitUntil: "load", timeout: 30000 });
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
