import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

export async function buildGuidePdf({ outputPath = fileURLToPath(new URL("../public/downloads/200days-hyrox-race-prep-template.pdf", import.meta.url)) } = {}) {
  const source = await readFile(new URL("../content/guides/templates/hyrox-race-prep-template.html", import.meta.url), "utf8");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(source.replaceAll("{{brand}}", "200 Days"), { waitUntil: "load" });
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    return outputPath;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildGuidePdf());
}
