import sharp from "sharp";

/** Decode, orient and bound an uploaded still, always producing a JPEG. */
export async function normalizeStillImage(buffer) {
  try {
    const image = sharp(buffer);
    await image.metadata();
    const { data, info } = await image
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, bytes: data.length };
  } catch {
    throw Object.assign(new Error("Could not read the image file."), { code: "invalid_image" });
  }
}
