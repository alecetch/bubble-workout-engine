// Mobile-preview QA tool for Forma's generated social assets (athlete carousel, race card, and
// the Data Lab insight posts). Renders every PNG in an input directory down to the actual pixel
// widths those images are seen at in an Instagram feed on a real phone, so "is this readable" can
// be judged from genuine feed-width pixels instead of the native 1080px/2160px source render.
//
// QA rule (documented here, not just implied): if meaningful text or a data label cannot be read
// in the 390px preview without zooming, the asset fails mobile-readability QA — see Phase 1/11 of
// docs/planning/... mobile-readability review. This is a judgment call for a human/reviewer looking
// at the previews, not an automated pass/fail — the tool's job is only to produce faithful previews.
//
// Usage: node scripts/mobilePreview.mjs <inputDir> [outputDir]
//   <inputDir>   directory of *.png files (e.g. a rendered sample pack)
//   [outputDir]  defaults to <inputDir>/mobile-preview/
//
// Each source PNG produces 3 files in the output dir: <name>-390.png, <name>-375.png, <name>-360.png
// — each resized (not cropped) to that exact CSS pixel width, preserving aspect ratio, so opening
// one is equivalent to viewing the real asset at that feed width on a real device.

import sharp from "sharp";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const WIDTHS = [390, 375, 360];

async function main() {
  const [inputDir, outputDirArg] = process.argv.slice(2);
  if (!inputDir) {
    console.error("Usage: node scripts/mobilePreview.mjs <inputDir> [outputDir]");
    process.exitCode = 1;
    return;
  }
  const outputDir = outputDirArg ?? join(inputDir, "mobile-preview");
  await mkdir(outputDir, { recursive: true });

  const files = (await readdir(inputDir)).filter((f) => f.toLowerCase().endsWith(".png"));
  if (files.length === 0) {
    console.error(`No PNG files found in ${inputDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Generating mobile previews (${WIDTHS.join("/")}px) for ${files.length} file(s) -> ${outputDir}`);
  for (const file of files) {
    const name = basename(file, extname(file));
    const srcPath = join(inputDir, file);
    for (const width of WIDTHS) {
      const outPath = join(outputDir, `${name}-${width}.png`);
      const buffer = await sharp(srcPath).resize({ width }).png().toBuffer();
      await writeFile(outPath, buffer);
    }
    console.log(`  [OK] ${file}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
