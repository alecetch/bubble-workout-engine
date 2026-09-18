import multer from "multer";

export const MAX_STILL_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
export const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

export function uploadSingle(fieldName, { maxBytes, supportedMimeTypes, extensionPattern, label }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter(_req, file, cb) {
      const mime = file.mimetype?.toLowerCase() ?? "";
      if (supportedMimeTypes.has(mime) || extensionPattern.test(file.originalname ?? "")) return cb(null, true);
      return cb(Object.assign(new Error(`Only ${label} files are supported.`), { code: "unsupported_file_type" }));
    },
  });

  return function uploadMiddleware(req, res, next) {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, code: "file_too_large", error: `${label} file is too large.` });
      }
      if (err.code === "unsupported_file_type") {
        return res.status(400).json({ ok: false, code: "unsupported_file_type", error: err.message });
      }
      return next(err);
    });
  };
}

export const uploadStillMiddleware = uploadSingle("still", {
  maxBytes: MAX_STILL_BYTES,
  supportedMimeTypes: IMAGE_MIME_TYPES,
  extensionPattern: /\.(jpe?g|png)$/i,
  label: "image",
});

export const uploadVideoMiddleware = uploadSingle("video", {
  maxBytes: MAX_VIDEO_BYTES,
  supportedMimeTypes: VIDEO_MIME_TYPES,
  extensionPattern: /\.(mp4|mov|m4v)$/i,
  label: "video",
});

