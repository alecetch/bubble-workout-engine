import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWebBrandAssets } from "../generate-web-brand-assets.mjs";
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../../api/package.json", import.meta.url))("sharp");

test("web brand outputs meet dimensions, alpha, SVG, ICO and byte determinism requirements", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "web-brand-"));
  try {
    await generateWebBrandAssets({ outDir });
    const names = ["200days-mark.svg", "200days-mark-light.svg", "200days-lockup.svg", "200days-lockup@2x.png", "favicon.svg", "favicon-32.png", "favicon-16.png", "favicon.ico", "apple-touch-icon.png", "og-200days.png", "200days-icon-1024.png"];
    assert.deepEqual((await readdir(outDir)).sort(), names.sort());
    const pngs = new Map();
    for (const [name, width, height, alpha] of [["og-200days.png", 1200, 630, false], ["apple-touch-icon.png", 180, 180, false], ["200days-icon-1024.png", 1024, 1024, false], ["favicon-32.png", 32, 32, true], ["favicon-16.png", 16, 16, true], ["200days-lockup@2x.png", null, 120, true]]) {
      const bytes = await readFile(join(outDir, name));
      assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
      if (width) assert.equal(bytes.readUInt32BE(16), width, name);
      assert.equal(bytes.readUInt32BE(20), height, name);
      assert.equal(bytes[25], alpha ? 6 : 2, name);
      if (alpha) {
        const pixel = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
        assert.equal(pixel[3], 0, `${name} has a transparent corner, not just an alpha channel`);
      }
      pngs.set(name, bytes);
    }
    for (const name of names.filter(name => name.endsWith(".svg"))) {
      const svg = await readFile(join(outDir, name), "utf8");
      assert.doesNotMatch(svg, /<text\b/);
      assert.match(svg, /id="ring-progress"[^>]*stroke="#22D3EE"/);
      if (name === "favicon.svg") {
        assert.doesNotMatch(svg, /id="ring-track"/);
        assert.match(svg, /id="digits"[^>]*stroke-width="12"/);
      }
    }
    const ico = await readFile(join(outDir, "favicon.ico"));
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 2);
    assert.deepEqual([ico[6], ico[22]], [16, 32]);
    for (const entry of [6, 22]) {
      const offset = ico.readUInt32LE(entry + 12), size = ico.readUInt32LE(entry + 8);
      assert.deepEqual(ico.subarray(offset, offset + size), pngs.get(`favicon-${ico[entry]}.png`));
    }
    await generateWebBrandAssets({ outDir });
    for (const [name, bytes] of pngs) assert.deepEqual(await readFile(join(outDir, name)), bytes, name);
    await generateWebBrandAssets({ outDir, accent: "#123456" });
    assert.match(await readFile(join(outDir, "200days-mark.svg"), "utf8"), /id="ring-progress"[^>]*stroke="#123456"/);
  } finally { await rm(outDir, { recursive: true, force: true }); }
});
