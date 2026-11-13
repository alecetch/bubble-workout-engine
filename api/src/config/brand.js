import logger from "../utils/logger.js";

let warnedUnknownVariant = false;

export function getBrand(env = process.env) {
  const is200Days = env.BRAND_VARIANT === "200days";
  if (env.BRAND_VARIANT !== undefined && env.BRAND_VARIANT !== "forma" && !is200Days && !warnedUnknownVariant) {
    warnedUnknownVariant = true;
    logger.warn("Unknown BRAND_VARIANT; falling back to forma");
  }
  return buildBrand(env, is200Days);
}

function buildBrand(env, is200Days) {
  const domain = is200Days ? "200days.app" : "getforma.fit";
  return Object.freeze({
    variant: is200Days ? "200days" : "forma",
    name: is200Days ? "200 Days" : "Forma",
    titleSuffix: is200Days ? "200 Days" : "Forma",
    tagline: is200Days ? "200 days changes everything" : "Measure. Understand. Improve.",
    defaultDescription: is200Days
      ? "200 days changes everything. Train 200 days a year. We plan every one."
      : "Forma - personalised strength and conditioning programs that adapt to your performance.",
    siteUrl: (env.BASE_URL ?? `https://${domain}`).replace(/\/+$/, ""),
    domain,
    supportEmail: env.SUPPORT_EMAIL ?? `support@${domain}`,
    pressEmail: env.PRESS_EMAIL ?? env.SUPPORT_EMAIL ?? `hello@${domain}`,
    logo: Object.freeze(is200Days ? {
      header: "/images/brand/200days-mark.svg",
      headerAlt: "",
      favicon: "/images/brand/favicon.svg",
      favicon32: "/images/brand/favicon-32.png",
      faviconIco: "/images/brand/favicon.ico",
      appleTouchIcon: "/images/brand/apple-touch-icon.png",
      ogImage: "/images/brand/og-200days.png",
      appIcon: "/images/brand/200days-icon-1024.png",
    } : {
      header: "/images/forma_masthead.png",
      headerAlt: "Forma - Measure. Understand. Improve.",
      favicon: "/images/forma_icon.png",
      favicon32: "/images/forma_icon.png",
      faviconIco: "/images/forma_icon.png",
      appleTouchIcon: "/images/forma_icon.png",
      ogImage: "/images/forma_masthead.png",
      appIcon: "/images/forma_icon.png",
    }),
    operator: "Engle Consulting Limited",
    legalUpdated: is200Days ? (env.LEGAL_UPDATED_DATE ?? "15 May 2026") : "15 May 2026",
    operatorLine: is200Days ? "Engle Consulting Limited, trading as 200 Days" : "",
  });
}

// Explicit Forma values for the published legacy copy branches.
export function getFormaBrand(env = process.env) {
  return buildBrand(env, false);
}
