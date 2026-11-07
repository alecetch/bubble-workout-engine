import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const sharp = createRequire(new URL("../../api/package.json", import.meta.url))("sharp");
const assets = new URL("../assets/", import.meta.url);
const canvasUnits = 200;
const markDiameter = 157; // ring radius 72 + half-stroke 6.5, doubled
const outputPixels = 1024;

function withoutBackground(svg) {
  const result = svg.replace(/<rect\b[^>]*\bid="background"[^>]*\/>/, "");
  if (result === svg) throw new Error("Source SVG must contain the background rect");
  return result;
}
function scaleMark(svg, fraction) {
  const scale = (fraction * canvasUnits) / markDiameter;
  return svg.replace(/<g\b(?=[^>]*\bid="mark")/, `<g transform="translate(100 100) scale(${scale}) translate(-100 -100)"><g`)
    .replace("</svg>", "</g></svg>");
}

export async function generateAppAssets() {
  const source = await readFile(new URL("source/app-icon.svg", assets), "utf8");
  for (const id of ["background", "mark", "ring-track", "ring-progress", "digits"]) {
    if (!source.includes(`id="${id}"`)) throw new Error(`Source SVG is missing #${id}`);
  }
  const transparent = withoutBackground(source);
  const adaptive = scaleMark(transparent, 0.60);
  const monochrome = adaptive.replace(/stroke="[^"]+"/g, 'stroke="#FFFFFF"')
    .replace(/(<circle\b(?=[^>]*\bid="ring-track")[^>]*)(\/>)/, '$1 stroke-opacity="0.35"$2');
  const variants = [
    ["icon.png", source, true],
    ["adaptive-icon.png", adaptive, false],
    ["adaptive-icon-monochrome.png", monochrome, false],
    ["splash-icon.png", transparent, false],
  ];
  await mkdir(assets, { recursive: true });
  for (const [name, svg, opaque] of variants) {
    let render = sharp(Buffer.from(svg), { density: 72 * outputPixels / canvasUnits }).resize(outputPixels, outputPixels);
    render = opaque ? render.flatten({ background: "#0F172A" }).removeAlpha() : render.ensureAlpha();
    await render.png().toFile(fileURLToPath(new URL(name, assets)));
    console.log(`Generated assets/${name} (${outputPixels}x${outputPixels})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateAppAssets();
}
