import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeStillImage } from "../normalizeStillImage.js";

function fixture(width, height) {
  return sharp({ create: { width, height, channels: 3, background: "#5588aa" } });
}

test("normalizes a large PNG to a bounded JPEG with its aspect ratio preserved", async () => {
  const result = await normalizeStillImage(await fixture(1672, 941).png().toBuffer());
  assert.deepEqual([...result.buffer.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.equal(result.width, 1280);
  assert.ok(Math.abs(result.height - 941 * 1280 / 1672) <= 1);
  assert.equal(result.bytes, result.buffer.length);
  assert.equal((await sharp(result.buffer).metadata()).format, "jpeg");
});

test("does not enlarge a small JPEG", async () => {
  const result = await normalizeStillImage(await fixture(600, 400).jpeg().toBuffer());
  assert.equal(result.width, 600);
  assert.equal(result.height, 400);
});

test("applies EXIF orientation and strips metadata", async () => {
  const input = await fixture(600, 400).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await normalizeStillImage(input);
  assert.equal(result.width, 400);
  assert.equal(result.height, 600);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
});

test("rejects undecodable input with invalid_image", async () => {
  await assert.rejects(normalizeStillImage(Buffer.from("not an image")), {
    code: "invalid_image", message: "Could not read the image file.",
  });
});
