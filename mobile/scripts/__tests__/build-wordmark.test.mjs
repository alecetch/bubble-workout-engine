import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWordmark } from "../build-wordmark.mjs";

test("vendored Inter produces deterministic single-path wordmark and tagline outlines", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "wordmark-"));
  try {
    await buildWordmark({ outDir });
    const before = [];
    for (const name of ["wordmark.svg", "tagline.svg"]) {
      const svg = await readFile(join(outDir, name), "utf8");
      assert.equal((svg.match(/<path\b/g) ?? []).length, 1);
      assert.match(svg, /\bd="[^"]+"/);
      assert.doesNotMatch(svg, /<text\b/);
      assert.match(svg, /viewBox="[^\"]+"/);
      before.push(svg);
    }
    await buildWordmark({ outDir });
    assert.deepEqual(await Promise.all(["wordmark.svg", "tagline.svg"].map(name => readFile(join(outDir, name), "utf8"))), before);
  } finally { await rm(outDir, { recursive: true, force: true }); }
});
