// Deterministic guard against the exact regression that prompted the 2026-08 mobile-readability
// audit: a font-size small enough at native 1080px canvas resolution to read fine in an editor
// preview, but effectively illegible once Instagram scales the image down to a ~375-390 CSS px
// feed width. This does NOT attempt OCR-based or visual readability scoring — it's a coarse,
// fast, deterministic regex sweep over declared `font-size:Npx` values in the two shared-token
// files, checked against a floor. It cannot tell you a slide LOOKS good; it can only stop a size
// from silently regressing below the floor this system has already agreed on.
//
// Usage: node scripts/lintTypography.mjs
// Exits 1 (and prints every offending declaration) if anything is below FLOOR_PX.
// Exits 0 and prints a summary table of all discovered sizes otherwise.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_script = dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  "../src/hyrox/reports/insightPosts/theme.js",
  "../src/hyrox/reports/insightPosts/components.js",
].map((p) => join(__dirname_script, p));

// Absolute floor for ANY text in the system, including Level 3 metadata/footer copy. This is
// deliberately below the L2 essential-copy floor (32px) — see README.md / CLAUDE.md context for
// the full L1/L2/L3 tier definitions. Nothing should ever render smaller than this, even evidence
// text, per the 2026-08 audit's "practical readability floor" rule for footers.
const FLOOR_PX = 17;

// SVG chart text uses font-size="18" (unquoted attribute, not a CSS declaration) rather than
// font-size:18px — matched separately so chart labels are covered by the same floor.
const CSS_PATTERN = /font-size\s*:\s*(\d+(?:\.\d+)?)px/g;
const SVG_ATTR_PATTERN = /font-size="(\d+(?:\.\d+)?)"/g;
const TYPOGRAPHY_TOKEN_PATTERN = /^\s*(l[123][A-Za-z0-9]*)\s*:\s*(\d+(?:\.\d+)?),/;

async function scanFile(path) {
  const src = await readFile(path, "utf8");
  const lines = src.split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const pattern of [CSS_PATTERN, SVG_ATTR_PATTERN]) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(line))) {
        hits.push({ file: path, line: i + 1, px: parseFloat(m[1]), context: line.trim().slice(0, 90) });
      }
    }
    const tokenMatch = line.match(TYPOGRAPHY_TOKEN_PATTERN);
    if (tokenMatch) {
      hits.push({ file: path, line: i + 1, px: parseFloat(tokenMatch[2]), context: line.trim().slice(0, 90) });
    }
  });
  return hits;
}

async function main() {
  const allHits = (await Promise.all(TARGETS.map(scanFile))).flat();
  allHits.sort((a, b) => a.px - b.px);

  const failures = allHits.filter((h) => h.px < FLOOR_PX);

  console.log(`Scanned ${TARGETS.length} file(s), found ${allHits.length} font-size declaration(s). Floor: ${FLOOR_PX}px.\n`);
  console.log("px   file:line  context");
  for (const h of allHits) {
    const rel = h.file.split(/[\\/]/).slice(-2).join("/");
    const flag = h.px < FLOOR_PX ? " <-- BELOW FLOOR" : "";
    console.log(`${String(h.px).padStart(4)} ${rel}:${h.line}  ${h.context}${flag}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} declaration(s) below the ${FLOOR_PX}px floor. Fix before merging.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll declarations at or above the ${FLOOR_PX}px floor.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
