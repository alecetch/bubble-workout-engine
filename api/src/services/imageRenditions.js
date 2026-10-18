import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { stillThumbKey, stillCardKey, posterCardKey, heroCardKey } from "../utils/mediaRenditionKeys.js";
import { exerciseMediaObjectKey } from "../utils/exerciseMediaObjectKey.js";
import { EXERCISE_MEDIA_BUCKET } from "./s3Service.js";
import logger from "../utils/logger.js";
export { stillThumbKey, stillCardKey, posterCardKey, heroCardKey };

export async function generateRenditions(buffer, kind) {
  if (!["still", "poster", "hero"].includes(kind)) throw new Error("Unknown image rendition kind");
  const configs = kind === "still"
    ? [["thumb", { height: 168, fit: "inside", withoutEnlargement: true }, 70], ["card", { width: 1080, fit: "inside", withoutEnlargement: true }, 75]]
    : [["card", kind === "hero" ? { width: 1080, height: 720, fit: "cover", position: "attention" } : { width: 1080, fit: "inside", withoutEnlargement: true }, 75]];
  const renditions = [];
  for (const [name, resize, quality] of configs) {
    const { data, info } = await sharp(buffer).rotate().resize(resize).webp({ quality }).toBuffer({ resolveWithObject: true });
    renditions.push({ name, buffer: data, width: info.width, height: info.height });
  }
  let thumbhash = null;
  if (kind !== "poster") {
    const { data, info } = await sharp(buffer).rotate().resize({ width: 100, height: 100, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    thumbhash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
  }
  return { renditions, thumbhash };
}

export function renditionKey(key, kind, name) {
  return kind === "hero" ? heroCardKey(key) : kind === "poster" ? posterCardKey(key) : name === "thumb" ? stillThumbKey(key) : stillCardKey(key);
}

// Derived files are best effort: the original remains usable if any step fails.
export async function storeImageRenditions({ db, table, idColumn, id, kind, key, buffer, putObjectFn,
  generateRenditionsFn = generateRenditions, log = logger, throwOnError = false }) {
  const timestamp = kind === "hero" ? "renditions_at" : `${kind}_renditions_at`;
  const hashColumn = kind === "hero" ? "thumbhash" : kind === "still" ? "still_thumbhash" : null;
  try {
    await db.query(`UPDATE ${table} SET ${timestamp} = NULL${hashColumn ? `, ${hashColumn} = NULL` : ""} WHERE ${idColumn} = $1`, [id]);
    const result = await generateRenditionsFn(buffer, kind);
    for (const rendition of result.renditions) {
      const target = renditionKey(key, kind, rendition.name);
      if (!target) throw new Error("Source key has no rendition key");
      await putObjectFn(exerciseMediaObjectKey(target), rendition.buffer, "image/webp", EXERCISE_MEDIA_BUCKET);
    }
    const fields = (await db.query(`UPDATE ${table} SET ${timestamp} = now()${hashColumn ? `, ${hashColumn} = $2` : ""} WHERE ${idColumn} = $1 RETURNING *`,
      hashColumn ? [id, result.thumbhash] : [id])).rows[0];
    return { ...result, fields };
  } catch (err) {
    log?.warn?.({ event: "media.renditions.failed", id, kind, err: err?.message }, "media.renditions.failed");
    if (throwOnError) throw err;
    return null;
  }
}
