import opentype from "opentype.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export async function buildWordmark({ outDir = new URL("../assets/source/", import.meta.url) } = {}) {
  const bytes = await readFile(new URL("../assets/source/fonts/Inter-SemiBold.ttf", import.meta.url));
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  // These Latin labels need no substitutions. Lay out glyphs with the font's
  // default kerning, avoiding unsupported Inter contextual-composition tables.
  function outline(text) {
    const path = new opentype.Path();
    const glyphs = [...text].map(char => font.charToGlyph(char));
    let x = 0;
    for (let i = 0; i < glyphs.length; i++) {
      path.commands.push(...glyphs[i].getPath(x, 0, 1000).commands);
      x += glyphs[i].advanceWidth * 1000 / font.unitsPerEm;
      if (glyphs[i + 1]) x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * 1000 / font.unitsPerEm;
    }
    return path;
  }
  const cap = outline("H").getBoundingBox();
  await mkdir(outDir, { recursive: true });
  for (const [name, text, fill] of [["wordmark.svg", "200 Days", "#F8FAFC"], ["tagline.svg", "200 days changes everything", "#94A3B8"]]) {
    const path = outline(text);
    const b = path.getBoundingBox();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x1} ${b.y1} ${b.x2 - b.x1} ${b.y2 - b.y1}" data-cap-height="${cap.y2 - cap.y1}"><path fill="${fill}" d="${path.toPathData(3)}"/></svg>\n`;
    await writeFile(join(outDir instanceof URL ? fileURLToPath(outDir) : outDir, name), svg);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildWordmark();
