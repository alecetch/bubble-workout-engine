// Rebuild: node api/scripts/build-carousel-background.mjs
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const defaultOutput = fileURLToPath(new URL("../src/hyrox/reports/assets/instagram-bg-200days.jpg", import.meta.url));

export async function buildCarouselBackground(outputPath = defaultOutput) {
  const mark = (await readFile(new URL("../public/images/brand/200days-mark.svg", import.meta.url), "utf8"))
    .replace('<svg ', '<svg x="360" y="225" opacity="0.12" ')
    .replace('width="157"', 'width="900"').replace('height="157"', 'height="900"');
  const dots = [];
  for (let x = 736; x < 1080; x += 32) {
    for (let y = 48; y < 1350; y += 32) dots.push(`<circle cx="${x}" cy="${y}" r="1.3" fill="#94A3B8" opacity="0.09"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs><linearGradient id="navy" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#07111F"/><stop offset="1" stop-color="#0F172A"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#navy)"/>${mark}${dots.join("")}
  </svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, jpeg);
  return jpeg;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2] ? resolve(process.argv[2]) : defaultOutput;
  await buildCarouselBackground(output);
  console.log(`Wrote ${output}`);
}
