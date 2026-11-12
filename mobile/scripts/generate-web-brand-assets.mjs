import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withoutBackground, scaleMark } from "./lib/iconSvg.mjs";

const sharp = createRequire(new URL("../../api/package.json", import.meta.url))("sharp");
const sourceDir = new URL("../assets/source/", import.meta.url);
const navy = "#0F172A";
const wrap = (body, width, height, viewBox = `0 0 ${width} ${height}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body.replace(/[ \t]+$/gm, "")}</svg>\n`;
const inside = svg => svg.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "")
  .replace(/<!--[\s\S]*?-->/g, "").replace(/[ \t]+$/gm, "").trim();
const bounds = svg => svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (let i = 0; i < images.length; i++) {
    const { size, png } = images[i];
    const entry = 6 + i * 16;
    header[entry] = size; header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([header, ...images.map(image => image.png)]);
}

export async function generateWebBrandAssets({ outDir = fileURLToPath(new URL("../../api/public/images/brand/", import.meta.url)), accent = "#22D3EE" } = {}) {
  if (!/^#[\da-f]{6}$/i.test(accent)) throw new Error("Accent must be a six-digit hex colour");
  const source = (await readFile(new URL("app-icon.svg", sourceDir), "utf8"))
    .replace(/(<path\b[^>]*id="ring-progress"[^>]*stroke=")[^"]+/, `$1${accent}`);
  const clear = withoutBackground(source);
  const mark = wrap(inside(clear), 157, 157, "21.5 21.5 157 157");
  const light = mark.replace('stroke="#F8FAFC"', 'stroke="#0F172A"').replace('stroke="#1E293B"', 'stroke="#CBD5E1"');
  const word = await readFile(new URL("wordmark.svg", sourceDir), "utf8");
  const tag = await readFile(new URL("tagline.svg", sourceDir), "utf8");
  const [wx, wy, ww, wh] = bounds(word);
  const capHeight = Number(word.match(/data-cap-height="([^"]+)"/)[1]);
  const factor = 157 * 0.42 / capHeight;
  const width = 157 + 157 * 0.25 + ww * factor;
  const wordHeight = wh * factor;
  const lockBody = `<g transform="translate(-21.5 -21.5)">${inside(clear)}</g><g transform="translate(${196.25 - wx * factor} ${(157 - wordHeight) / 2 - wy * factor}) scale(${factor})">${inside(word)}</g>`;
  const lockup = wrap(lockBody, width, 157);
  const favicon = wrap(`<circle cx="100" cy="100" r="100" fill="${navy}"/>${inside(clear)
    .replace(/<circle\b[^>]*id="ring-track"[^>]*\/>/, "")
    .replace('id="digits" stroke="#F8FAFC" stroke-width="9"', 'id="digits" stroke="#F8FAFC" stroke-width="12"')}`, 200, 200);
  const [tx, ty, tw, th] = bounds(tag);
  const tagScale = 700 / tw;
  const lockScale = 260 / 157;
  const lockX = (1200 - width * lockScale) / 2;
  const lockTop = (630 - (260 + 48 + th * tagScale)) / 2;
  const tagTop = lockTop + 260 + 48;
  const og = wrap(`<rect width="1200" height="630" fill="${navy}"/><g transform="translate(${lockX} ${lockTop}) scale(${lockScale})">${lockBody}</g><g transform="translate(${(1200 - tw * tagScale) / 2 - tx * tagScale} ${tagTop - ty * tagScale}) scale(${tagScale})">${inside(tag)}</g>`, 1200, 630);
  await mkdir(outDir, { recursive: true });
  for (const [name, svg] of [["200days-mark.svg", mark], ["200days-mark-light.svg", light], ["200days-lockup.svg", lockup], ["favicon.svg", favicon]]) await writeFile(join(outDir, name), svg);
  async function png(name, svg, w, h, opaque) {
    let render = sharp(Buffer.from(svg), { density: 288 }).resize(w, h);
    render = opaque ? render.flatten({ background: navy }).removeAlpha() : render.ensureAlpha();
    const bytes = await render.png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    await writeFile(join(outDir, name), bytes);
    return bytes;
  }
  const lockWidth = Math.round(width * 120 / 157);
  await png("200days-lockup@2x.png", lockup, lockWidth, 120, false);
  const small = [];
  for (const size of [16, 32]) small.push({ size, png: await png(`favicon-${size}.png`, favicon, size, size, false) });
  await writeFile(join(outDir, "favicon.ico"), ico(small));
  await png("apple-touch-icon.png", scaleMark(clear, 0.70), 180, 180, true);
  await png("og-200days.png", og, 1200, 630, true);
  await png("200days-icon-1024.png", source, 1024, 1024, true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await generateWebBrandAssets();
