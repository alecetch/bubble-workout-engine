import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicUrl, resolveMediaUrl } from "../mediaUrl.js";

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

test("resolveMediaUrl returns null for null row", () => {
  assert.equal(resolveMediaUrl(null), null);
});
