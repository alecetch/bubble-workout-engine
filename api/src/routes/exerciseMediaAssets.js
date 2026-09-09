import express from "express";
import { pipeline } from "node:stream/promises";
import { EXERCISE_MEDIA_BUCKET, getObjectStream } from "../services/s3Service.js";
import { publicInternalError } from "../utils/publicError.js";

const ONE_DAY_SECONDS = 86400;

// Allow-list, not a blocklist: the S3/MinIO key becomes a real filesystem path
// under MinIO's storage backend, so an unsanitized ".." segment in the request
// path could read files outside the exercise-media bucket. Every legitimate key
// is either the shared placeholder or "<exerciseId>/<still|video|poster>.<ext>".
const SAFE_KEY_PATTERN = /^[A-Za-z0-9_-]+\/(?:still\.jpg|video\.mp4|poster\.jpg)$/;

function normalizeObjectKey(path) {
  const key = String(path ?? "").replace(/^\/+/, "").replace(/^exercise-media\/+/, "");
  return SAFE_KEY_PATTERN.test(key) ? key : null;
}

function isMissingObjectError(err) {
  const name = err?.name || err?.Code || err?.code;
  return name === "NoSuchKey" || name === "NotFound" || err?.$metadata?.httpStatusCode === 404;
}

function headerValue(value) {
  return value == null ? undefined : String(value);
}

export function createExerciseMediaAssetsRouter({
  getObjectStreamFn = getObjectStream,
  bucket = EXERCISE_MEDIA_BUCKET,
} = {}) {
  const router = express.Router();

  router.get(/.*/, async (req, res, next) => {
    const key = normalizeObjectKey(req.path);
    if (!key) return next();

    try {
      const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
      const object = await getObjectStreamFn(key, bucket, range);
      const statusCode = object.ContentRange ? 206 : 200;

      res.status(statusCode);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", `public, max-age=${ONE_DAY_SECONDS}`);
      if (object.ContentType) res.setHeader("Content-Type", object.ContentType);
      if (object.ContentLength != null) res.setHeader("Content-Length", String(object.ContentLength));
      if (object.ContentRange) res.setHeader("Content-Range", object.ContentRange);
      if (object.ETag) res.setHeader("ETag", object.ETag);
      if (object.LastModified) res.setHeader("Last-Modified", object.LastModified.toUTCString());

      await pipeline(object.Body, res);
    } catch (err) {
      if (isMissingObjectError(err)) return next();
      if (err?.$metadata?.httpStatusCode === 416) {
        const contentRange = headerValue(err?.$response?.headers?.["content-range"]);
        if (contentRange) res.setHeader("Content-Range", contentRange);
        return res.status(416).end();
      }
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}

export const exerciseMediaAssetsRouter = createExerciseMediaAssetsRouter();
