import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Readable } from "node:stream";
import { get } from "node:http";
import { createExerciseMediaAssetsRouter } from "../src/routes/exerciseMediaAssets.js";

function streamOf(text) {
  return Readable.from([Buffer.from(text)]);
}

async function withServer(getObjectStreamFn, fn) {
  const app = express();
  app.use("/assets/exercise-media", createExerciseMediaAssetsRouter({ getObjectStreamFn }));
  app.use("/assets/exercise-media", (_req, res) => res.status(404).end());
  app.use((_req, res) => res.type("html").send("<html>App</html>"));
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
      assert.equal(await res.text(), "");
      assert.doesNotMatch(res.headers.get("content-type") ?? "", /html/);
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
      // Send raw paths: fetch normalizes literal and encoded dot segments
      // before they reach Express, which would not exercise the asset mount.
      for (const path of ["/assets/exercise-media/../secret", "/assets/exercise-media/%2e%2e/%2e%2e/etc/passwd"]) {
        const { hostname, port } = new URL(base);
        const response = await new Promise((resolve, reject) => {
          get({ hostname, port, path }, res => {
            let body = "";
            res.on("data", chunk => { body += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, body }));
          }).on("error", reject);
        });
        assert.equal(response.status, 404);
        assert.equal(response.body, "");
      }

      const unexpectedShape = await fetch(`${base}/assets/exercise-media/foo/bar.exe`);
      assert.equal(unexpectedShape.status, 404);
      assert.equal(await unexpectedShape.text(), "");
    },
  );
  assert.equal(called, false);
});

test("streams warm-up and cool-down library media stored under their key prefixes", async () => {
  const keys = [];
  await withServer(
    async (key) => {
      keys.push(key);
      return { Body: streamOf("bytes"), ContentType: "image/jpeg" };
    },
    async (base) => {
      for (const path of [
        "warmup-exercise-media/warmup-cat-cow/still.jpg",
        "cooldown-exercise-media/cooldown-child-pose/video.mp4",
        "exercise-media/warmup-exercise-media/warmup-cat-cow/poster.jpg",
      ]) {
        const res = await fetch(`${base}/assets/exercise-media/${path}`);
        assert.equal(res.status, 200, path);
      }
    },
  );
  assert.deepEqual(keys, [
    "warmup-exercise-media/warmup-cat-cow/still.jpg",
    "cooldown-exercise-media/cooldown-child-pose/video.mp4",
    "warmup-exercise-media/warmup-cat-cow/poster.jpg",
  ]);
});

test("rejects unknown prefixes and extra nesting without touching the storage backend", async () => {
  let called = false;
  await withServer(
    async () => {
      called = true;
      return { Body: streamOf("nope") };
    },
    async (base) => {
      for (const path of [
        "sled_push/source.mp4",
        "sled_push/source.mov",
        "sled_push/video.pre-540p.mp4",
        "other-media/sled_push/still.jpg",
        "warmup-exercise-media/a/b/still.jpg",
        "warmup-exercise-media/%2e%2e/still.jpg",
      ]) {
        const res = await fetch(`${base}/assets/exercise-media/${path}`);
        assert.equal(res.status, 404, path);
      }
    },
  );
  assert.equal(called, false);
});
