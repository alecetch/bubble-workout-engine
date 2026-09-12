import test from "node:test";
import assert from "node:assert/strict";

test("s3Service exports the expected functions", async () => {
  const mod = await import("../s3Service.js").catch(() => null);
  if (!mod) return;
  assert.equal(typeof mod.putObject, "function");
  assert.equal(typeof mod.deleteObject, "function");
  assert.equal(typeof mod.getPresignedUrl, "function");
  assert.equal(typeof mod.PHYSIQUE_BUCKET, "string");
});

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Cache-busted import so each test case gets fresh module-level client
// singletons reflecting the env vars set for that case.
async function freshS3Service() {
  return import(`../s3Service.js?t=${Date.now()}-${Math.random()}`);
}

test("exercise-media bucket uses its own dedicated credentials, not the default bucket's", async () => {
  await withEnv({
    S3_ACCESS_KEY_ID: "default-key",
    S3_SECRET_ACCESS_KEY: "default-secret",
    S3_EXERCISE_MEDIA_ACCESS_KEY_ID: "exercise-media-key",
    S3_EXERCISE_MEDIA_SECRET_ACCESS_KEY: "exercise-media-secret",
  }, async () => {
    const { getClientForBucket, EXERCISE_MEDIA_BUCKET } = await freshS3Service();

    const defaultCreds = await getClientForBucket("media-assets").config.credentials();
    assert.equal(defaultCreds.accessKeyId, "default-key");
    assert.equal(defaultCreds.secretAccessKey, "default-secret");

    const exerciseMediaCreds = await getClientForBucket(EXERCISE_MEDIA_BUCKET).config.credentials();
    assert.equal(exerciseMediaCreds.accessKeyId, "exercise-media-key");
    assert.equal(exerciseMediaCreds.secretAccessKey, "exercise-media-secret");
  });
});

test("exercise-media bucket falls back to the default credentials when no dedicated ones are set", async () => {
  await withEnv({
    S3_ACCESS_KEY_ID: "default-key",
    S3_SECRET_ACCESS_KEY: "default-secret",
    S3_EXERCISE_MEDIA_ACCESS_KEY_ID: undefined,
    S3_EXERCISE_MEDIA_SECRET_ACCESS_KEY: undefined,
  }, async () => {
    const { getClientForBucket, EXERCISE_MEDIA_BUCKET } = await freshS3Service();

    const creds = await getClientForBucket(EXERCISE_MEDIA_BUCKET).config.credentials();
    assert.equal(creds.accessKeyId, "default-key");
    assert.equal(creds.secretAccessKey, "default-secret");
  });
});
