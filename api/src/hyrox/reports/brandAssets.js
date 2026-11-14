import { readFileSync } from "node:fs";
import { getBrand } from "../../config/brand.js";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Only the retained legacy branch embeds a PNG; current-brand emails use hosted assets.
let cachedLegacyLogo;
const svgCache = new Map();
function legacyLogo() {
  if (cachedLegacyLogo === undefined) {
    try { cachedLegacyLogo = `data:image/png;base64,${readFileSync(new URL("./assets/forma-logo.png", import.meta.url)).toString("base64")}`; }
    catch { cachedLegacyLogo = ""; }
  }
  return cachedLegacyLogo;
}

function legacyReportLogo(size, brand) {
  const width = Math.round(size * brand.logo.lockupAspect);
  if (legacyLogo()) {
    return `<img src="${legacyLogo()}" alt="Forma — Measure. Understand. Improve." width="${width}" height="${size}"
      style="width:${width}px;height:${size}px;display:block;" />`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:${Math.round(size * 0.2)}px;">
    <span style="display:inline-flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;background-color:#00a3f5;border-radius:6px;
      color:#ffffff;font-family:'Inter Tight',Arial,sans-serif;font-size:${Math.round(size * 0.5)}px;
      font-weight:800;line-height:1;">F</span>
    <span style="font-family:'Inter Tight','Arial Narrow',Arial,sans-serif;font-size:${Math.round(size * 0.6)}px;
      font-weight:700;color:#f8fafc;letter-spacing:0.5px;line-height:1;">FORMA</span>
  </span>`;
}

function legacyRunningLogo(size, brand) {
  const width = Math.round(size * brand.logo.lockupAspect);
  if (legacyLogo()) {
    return `<img src="${legacyLogo()}" alt="Forma — Measure. Understand. Improve." width="${width}" height="${size}" style="width:${width}px;height:${size}px;display:block;" />`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:${Math.round(size * 0.2)}px;">
    <span style="background:#00a3f5;width:${size}px;height:${size}px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:${Math.round(size * 0.44)}px;">F</span>
    <span style="font-size:${Math.round(size * 0.55)}px;font-weight:700;color:#f8fafc;">FORMA</span>
  </span>`;
}

export function emailLogoImg({ height = 28, brand = getBrand(), legacyLayout = "report" } = {}) {
  if (brand.variant !== "200days") return legacyLayout === "running" ? legacyRunningLogo(height, brand) : legacyReportLogo(height, brand);
  const width = Math.round(height * brand.logo.lockupAspect);
  const src = brand.siteUrl.replace(/\/+$/, "") + brand.logo.lockup;
  return `<img src="${esc(src)}" alt="${esc(brand.name)}" width="${width}" height="${height}" style="display:block;border:0;width:${width}px;height:${height}px;" />`;
}

export function lockupSvgInline({ height = 28, brand = getBrand() } = {}) {
  if (!brand.logo.lockupSvg) return emailLogoImg({ height, brand });
  const path = brand.logo.lockupSvg;
  if (!svgCache.has(path)) svgCache.set(path, readFileSync(new URL(`../../../public${path}`, import.meta.url), "utf8"));
  return svgCache.get(path).replace(/<svg\b([^>]*)>/, (_tag, attrs) =>
    `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, "")} width="${Math.round(height * brand.logo.lockupAspect)}" height="${height}">`);
}

export function brandFooterLine(brand = getBrand()) {
  return brand.variant === "200days" ? brand.domain : `www.${brand.domain}`;
}
