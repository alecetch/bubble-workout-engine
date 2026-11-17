import { readAppVersionPolicy } from "./appVersionPolicy.js";
import logger from "../utils/logger.js";
import { isPhysiqueEnabled } from "./features.js";
import { getBrand } from "./brand.js";

const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

export function findLocalhostProductionEnvErrors(env = process.env) {
  if (env.NODE_ENV !== "production") return [];

  const errors = [];

  const appDomain = env.APP_DOMAIN ?? "http://localhost:3000";
  if (LOCAL_HOST_PATTERN.test(appDomain)) {
    errors.push(
      `APP_DOMAIN resolves to a local host in production ("${appDomain}"). ` +
      `Set APP_DOMAIN to the public site URL (e.g. ${getBrand(env).siteUrl}).`,
    );
  }

  const ctaBase = env.FORMA_APP_BASE_URL ?? env.FORMA_CTA_URL ?? getBrand(env).siteUrl;
  if (LOCAL_HOST_PATTERN.test(ctaBase)) {
    errors.push(
      `FORMA_APP_BASE_URL/FORMA_CTA_URL resolves to a local host in production ("${ctaBase}").`,
    );
  }

  const splitTableBase = env.BASE_URL ?? getBrand(env).siteUrl;
  if (LOCAL_HOST_PATTERN.test(splitTableBase)) {
    errors.push(`BASE_URL resolves to a local host in production ("${splitTableBase}").`);
  }

  return errors;
}

export function validateProductionEnv(env = process.env) {
  if (env.NODE_ENV === 'production' && (!env.PASSWORD_RESET_HMAC_SECRET || env.PASSWORD_RESET_HMAC_SECRET.length < 32)) {
    logger.warn({ event: 'auth.password_reset.hmac_fallback' }, 'PASSWORD_RESET_HMAC_SECRET is missing or short; using the JWT-derived fallback.');
  }
  if (env.NODE_ENV === "production") {
    const policy = readAppVersionPolicy(env, { warn() {} });
    for (const [platform, value] of Object.entries(policy)) {
      if (value.min_build !== null && value.update_url === null) logger.warn({ event: "app_config.missing_update_url", platform }, `Mobile ${platform} minimum build has no update URL.`);
    }
  }
  if (env.NODE_ENV === "production" && env.REMINDER_SCHEDULER_ENABLED !== "true") {
    logger.warn("REMINDER_SCHEDULER_ENABLED is not set to true; workout reminders will not be sent automatically.");
  }
  if (isPhysiqueEnabled(env) && !env.OPENAI_API_KEY?.trim()) {
    logger.warn("PHYSIQUE_ENABLED=true without OPENAI_API_KEY; physique analysis is unavailable.");
  }
  if (env.REFERRAL_REWARDS_ENABLED === "true" && !env.REVENUECAT_SECRET_API_KEY?.trim()) {
    logger.warn({ event: "referral.config.missing_key" }, "Referral rewards enabled without REVENUECAT_SECRET_API_KEY.");
  }
  if (env.NODE_ENV === "production" && env.REFERRAL_REWARDS_ALLOW_SANDBOX === "true") {
    logger.warn({ event: "referral.config.sandbox_enabled" }, "Sandbox referral rewards are enabled in production.");
  }
  const errors = findLocalhostProductionEnvErrors(env);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to start in production with invalid environment configuration:\n${errors.join("\n")}`,
    );
  }
}
