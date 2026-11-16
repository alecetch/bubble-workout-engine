import logger from "../utils/logger.js";

export function readAppVersionPolicy(env = process.env, log = logger) {
  const build = name => {
    const value = env[name];
    if (value === undefined) return null;
    const number = Number(value);
    if (typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(number)) return number;
    log.warn({ event: "app_config.invalid_build", variable: name });
    return null;
  };
  const platform = name => {
    const min_build = build(`MOBILE_MIN_BUILD_${name}`);
    const latest_build = build(`MOBILE_LATEST_BUILD_${name}`);
    const variable = `MOBILE_UPDATE_URL_${name}`;
    let update_url = env[variable] ?? (name === "ANDROID" ? "https://play.google.com/store/apps/details?id=fit.get200days.app" : null);
    if (update_url !== null && (typeof update_url !== "string" || !/^(https:\/\/|itms-beta:\/\/)/.test(update_url))) {
      log.warn({ event: "app_config.invalid_url", variable });
      update_url = null;
    }
    if (min_build !== null && latest_build !== null && min_build > latest_build) log.warn({ event: "app_config.min_above_latest", platform: name.toLowerCase() });
    return { min_build, latest_build, update_url };
  };
  return { ios: platform("IOS"), android: platform("ANDROID") };
}

export const appVersionPolicy = readAppVersionPolicy();
