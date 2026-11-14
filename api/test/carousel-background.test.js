import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildCarouselBackground } from "../scripts/build-carousel-background.mjs";

test("carousel background is a deterministic 1080 by 1350 JPEG", async t => {
  const directory = await mkdtemp(join(tmpdir(), "hyrox-background-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, "first.jpg");
  const second = join(directory, "second.jpg");
  await buildCarouselBackground(first);
  await buildCarouselBackground(second);
  const bytes = await readFile(first);
  assert.deepEqual(bytes, await readFile(second));
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1350);
  assert.equal(metadata.format, "jpeg");
});
