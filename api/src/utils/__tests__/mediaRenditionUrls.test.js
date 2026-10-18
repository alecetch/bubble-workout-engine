import test from "node:test";
import assert from "node:assert/strict";
import { renditionUrl, exerciseRenditionFields, heroRenditionFields } from "../mediaUrl.js";
test("rendition URLs require readiness and placeholders suppress still fields", () => {
  const old = process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL;
  process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL = "https://cdn.test";
  try {
    assert.equal(renditionUrl("a/still-card.webp", null), null);
    assert.equal(renditionUrl("a/still-card.webp", "now"), "https://cdn.test/a/still-card.webp");
    const row = { still_image_key: "a/still.jpg", still_image_is_placeholder: false, still_renditions_at: "now", still_thumbhash: "hash", video_status: "ready", poster_frame_key: "a/poster.jpg", poster_renditions_at: "now" };
    assert.deepEqual(exerciseRenditionFields(row), { stillThumbUrl: "https://cdn.test/a/still-thumb.webp", stillCardUrl: "https://cdn.test/a/still-card.webp", stillThumbhash: "hash", posterCardUrl: "https://cdn.test/a/poster-card.webp" });
    assert.equal(exerciseRenditionFields({ ...row, still_image_is_placeholder: true }).stillThumbUrl, null);
    assert.equal(heroRenditionFields("program/a.png", "now", "hash").heroMediaCardUrl, null);
    assert.equal(heroRenditionFields("hero-media/program/a.png", "now", "hash").heroMediaCardUrl, "https://cdn.test/hero-media/program/a-card.webp");
  } finally { if (old === undefined) delete process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL; else process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL = old; }
});
