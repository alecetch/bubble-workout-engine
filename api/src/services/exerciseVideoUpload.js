import { TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT } from "./exerciseMediaCompression.js";
import { EXERCISE_MEDIA_BUCKET } from "./s3Service.js";
import { exerciseMediaObjectKey } from "../utils/exerciseMediaObjectKey.js";

export function videoSourceExtension(name) {
  const extension = String(name ?? "").split(".").pop().toLowerCase();
  return ["mp4", "mov", "m4v"].includes(extension) ? extension : "mp4";
}

export async function processVideoUpload({ file, prefix, precompressed, putObjectFn, compressExerciseVideoFn, probeVideoFn, remuxFaststartFn }) {
  let sourceKey = null;
  if (!precompressed) {
    sourceKey = `${prefix}/source.${videoSourceExtension(file.originalname)}`;
    try {
      await putObjectFn(exerciseMediaObjectKey(sourceKey), file.buffer, file.mimetype, EXERCISE_MEDIA_BUCKET);
    } catch (cause) {
      throw Object.assign(new Error("Could not store the original video.", { cause }), { code: "video_source_storage_failed" });
    }
  }
  let conforming = false;
  if (precompressed) {
    const probe = await probeVideoFn(file.buffer);
    conforming = probe.codec === "h264" && probe.pixFmt === "yuv420p"
      && probe.width > 0 && probe.width <= TARGET_MAX_WIDTH && probe.height > 0 && probe.height <= TARGET_MAX_HEIGHT
      && probe.hasAudio === false;
  }
  const result = await (conforming ? remuxFaststartFn : compressExerciseVideoFn)(file.buffer);
  return { ...result, sourceKey };
}

export async function deleteVideoSource({ db, table, idColumn, id, deleteObjectFn }) {
  const result = await db.query(`SELECT video_source_key FROM ${table} WHERE ${idColumn} = $1`, [id]);
  const sourceKey = result.rows[0]?.video_source_key;
  if (!sourceKey) return;
  try {
    await deleteObjectFn(exerciseMediaObjectKey(sourceKey), EXERCISE_MEDIA_BUCKET);
  } catch (error) {
    if (![error?.name, error?.code, error?.Code].some(value => value === "NoSuchKey" || value === "NotFound")
      && error?.$metadata?.httpStatusCode !== 404) throw error;
  }
}
