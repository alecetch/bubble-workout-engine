import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Readable } from "node:stream";
import { createExerciseMediaAssetsRouter } from "../src/routes/exerciseMediaAssets.js";

function streamOf(text) {
  return Readable.from([Buffer.from(text)]);
}

async function withServer(getObjectStreamFn, fn) {
  const app = express();
  app.use("/assets/exercise-media", createExerciseMediaAssetsRouter({ getObjectStreamFn }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /assets/exercise-media/:exerciseId/still.jpg streams the object", async () => {
  const calls = [];
  await withServer(
    async (key, bucket) => {
      calls.push({ key, bucket });
      return {
        Body: streamOf("jpeg-bytes"),
        ContentType: "image/jpeg",
        ContentLength: 10,
        ETag: '"abc"',
      };
    },
    async (base) => {
      const res = await fetch(`${base}/assets/exercise-media/sled_push/still.jpg`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/jpeg");
      assert.equal(await res.text(), "jpeg-bytes");
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "sled_push/still.jpg");
  assert.equal(calls[0].bucket, "exercise-media");
});

test("GET with a Range header returns 206 and passes the range through", async () => {
  let receivedRange;
  await withServer(
    async (_key, _bucket, range) => {
      receivedRange = range;
      return {
        Body: streamOf("partial"),
        ContentType: "video/mp4",
        ContentRange: "bytes 0-6/100",
        ContentLength: 7,
      };
    },
    async (base) => {
      const res = await fetch(`${base}/assets/exercise-media/sled_push/video.mp4`, {
        headers: { Range: "bytes=0-6" },
      });
      assert.equal(res.status, 206);
      assert.equal(res.headers.get("content-range"), "bytes 0-6/100");
    },
  );
  assert.equal(receivedRange, "bytes=0-6");
});

test("missing object falls through to a 404", async () => {
  await withServer(
    async () => {
      const err = new Error("not found");
      err.name = "NoSuchKey";
      throw err;
    },
    async (base) => {
      const res = await fetch(`${base}/assets/exercise-media/unknown_exercise/still.jpg`);
      assert.equal(res.status, 404);
    },
  );
});

test("rejects path-traversal-shaped keys without ever touching the storage backend", async () => {
  let called = false;
  await withServer(
    async () => {
      called = true;
      return { Body: streamOf("nope") };
    },
    async (base) => {
      // %2e%2e (not a literal "..") so the fetch/WHATWG URL parser doesn't
      // collapse the dot-segments itself before the request ever reaches the
      // server — this exercises the same encoded-traversal shape a real
      // attacker would send, past any client-side normalization.
      const traversal = await fetch(
        `${base}/assets/exercise-media/%2e%2e/%2e%2e/etc/passwd`,
      );
      assert.equal(traversal.status, 404);

      const unexpectedShape = await fetch(`${base}/assets/exercise-media/sled_push/video.mp4.exe`);
      assert.equal(unexpectedShape.status, 404);
    },
  );
  assert.equal(called, false);
});
