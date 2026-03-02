import { resolveMediaUrl } from "../src/utils/mediaUrl.js";

// Pure hero-media resolver helpers used by runPipeline.
export function dayFocusSlug(day) {
  const segs = (day && day.segments) || [];
  let mainSlot = "";
  for (const seg of segs) {
    if (
      seg &&
      seg.purpose === "main" &&
      Array.isArray(seg.items) &&
      seg.items[0]?.slot
    ) {
      mainSlot = String(seg.items[0].slot);
      break;
    }
  }
  if (!mainSlot) return "full_body";
  if (
    mainSlot.includes("squat") ||
    mainSlot.includes("hinge") ||
    mainSlot.includes("lunge")
  ) return "lower_body";
  if (
    mainSlot.includes("push") ||
    mainSlot.includes("pull")
  ) return "upper_body";
  return "full_body";
}

export function resolveHeroMediaRow(assets, usageScope, programType, focusType) {
  const inScope = assets.filter((a) => a.usage_scope === usageScope);
  if (!inScope.length) return null;

  if (focusType) {
    const exact = inScope.find(
      (a) => a.day_type === programType && a.focus_type === focusType,
    );
    if (exact) return exact;
    const fullBody = inScope.find(
      (a) => a.day_type === programType && a.focus_type === "full_body",
    );
    if (fullBody) return fullBody;
  }
  const noFocus = inScope.find(
    (a) => a.day_type === programType && (a.focus_type === null || a.focus_type === ""),
  );
  if (noFocus) return noFocus;
  const typeAny = inScope.find((a) => a.day_type === programType);
  if (typeAny) return typeAny;
  const generic = inScope.find((a) => a.day_type === "generic");
  if (generic) return generic;
  return inScope[0] ?? null;
}

export function toHeroMediaObject(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    image_key: String(row.image_key),
    image_url: resolveMediaUrl(row) ?? "",
  };
}
