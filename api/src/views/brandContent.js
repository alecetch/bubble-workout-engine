import { getBrand } from "../config/brand.js";

// Resolve content before markdown/front matter rendering, always at request time.
export function renderBrandContent(source, brand = getBrand()) {
  let text = source;
  if (brand.variant === "200days") {
    const subjects = [
      ["{{brand}} is built to handle exactly this tension.", "We build for exactly this tension."],
      ["{{brand}} organises", "We organise"],
      ["{{brand}} tracks", "We track"],
      ["{{brand}} layers", "We layer"],
      ["{{brand}} doesn't use", "We don't use"],
      ["{{brand}} does the same thing", "We do the same thing"],
      ["How {{brand}} handles", "How we handle"],
      ["How {{brand}} builds", "How we build"],
    ];
    for (const [from, to] of subjects) text = text.replaceAll(from, to);
  }
  return text.replaceAll("{{brand}}", brand.name);
}

export function guideDownloadFile(meta, brand = getBrand()) {
  return brand.variant === "200days" && meta.leadMagnetFile200days
    ? meta.leadMagnetFile200days : meta.leadMagnetFile;
}
