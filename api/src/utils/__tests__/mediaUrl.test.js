import test from "node:test";
import assert from "node:assert/strict";
import { buildExerciseMediaUrl, buildPublicUrl, resolveMediaUrl } from "../mediaUrl.js";

test("buildPublicUrl constructs base + key and trims slashes", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com///";
  try {
    assert.equal(buildPublicUrl("/hero.jpg"), "https://cdn.example.com/hero.jpg");
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
  }
});

test("buildPublicUrl returns key string when S3_PUBLIC_BASE_URL missing", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  delete process.env.S3_PUBLIC_BASE_URL;
  try {
    assert.equal(buildPublicUrl("images/hero.png"), "images/hero.png");
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
  }
});

test("buildPublicUrl trims trailing slash on base", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "https://assets.example.com/";
  try {
    assert.equal(buildPublicUrl("x/y.png"), "https://assets.example.com/x/y.png");
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
  }
});

test("resolveMediaUrl returns absolute image_url as-is", () => {
  const row = { image_url: "https://img.example.com/z.png", image_key: "ignored.png" };
  assert.equal(resolveMediaUrl(row), "https://img.example.com/z.png");
});

test("resolveMediaUrl builds from image_key when image_url empty", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com";
  try {
    const row = { image_url: "", image_key: "hero/a.jpg" };
    assert.equal(resolveMediaUrl(row), "https://cdn.example.com/hero/a.jpg");
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
  }
});

test("buildExerciseMediaUrl derives sibling local static base from media-assets base", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  const oldExerciseBase = process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "http://192.168.1.213:3000/assets/media-assets";
  delete process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL;
  try {
    assert.equal(
      buildExerciseMediaUrl("exercise-media/_placeholder/still.jpg"),
      "http://192.168.1.213:3000/assets/exercise-media/_placeholder/still.jpg",
    );
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
    process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL = oldExerciseBase;
  }
});

test("buildExerciseMediaUrl honors explicit exercise media public base", () => {
  const oldBase = process.env.S3_PUBLIC_BASE_URL;
  const oldExerciseBase = process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "http://wrong.example.com/assets/media-assets";
  process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com/exercise-media/";
  try {
    assert.equal(
      buildExerciseMediaUrl("exercise-media/sled_push/video.mp4"),
      "https://cdn.example.com/exercise-media/sled_push/video.mp4",
    );
  } finally {
    process.env.S3_PUBLIC_BASE_URL = oldBase;
    process.env.S3_EXERCISE_MEDIA_PUBLIC_BASE_URL = oldExerciseBase;
  }
});

test("resolveMediaUrl returns null for null row", () => {
  assert.equal(resolveMediaUrl(null), null);
});
