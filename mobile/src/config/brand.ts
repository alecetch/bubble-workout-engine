import appConfig from "../../app.json";

export const BRAND_WORDMARK = appConfig.expo.name;
export const BRAND_DOMAIN = "200days.app";

export const WEBSITE_BASE_URL = (process.env.EXPO_PUBLIC_WEBSITE_BASE_URL || `https://${BRAND_DOMAIN}`).replace(/\/+$/, "");
