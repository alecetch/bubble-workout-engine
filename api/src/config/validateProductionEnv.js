const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

export function findLocalhostProductionEnvErrors(env = process.env) {
  if (env.NODE_ENV !== "production") return [];

  const errors = [];

  const appDomain = env.APP_DOMAIN ?? "http://localhost:3000";
  if (LOCAL_HOST_PATTERN.test(appDomain)) {
    errors.push(
      `APP_DOMAIN resolves to a local host in production ("${appDomain}"). ` +
      "Set APP_DOMAIN to the public site URL (e.g. https://www.getforma.fit).",
    );
  }

  const ctaBase = env.FORMA_APP_BASE_URL ?? env.FORMA_CTA_URL ?? "https://www.getforma.fit";
  if (LOCAL_HOST_PATTERN.test(ctaBase)) {
    errors.push(
      `FORMA_APP_BASE_URL/FORMA_CTA_URL resolves to a local host in production ("${ctaBase}").`,
    );
  }

  const splitTableBase = env.BASE_URL ?? "https://www.getforma.fit";
  if (LOCAL_HOST_PATTERN.test(splitTableBase)) {
    errors.push(`BASE_URL resolves to a local host in production ("${splitTableBase}").`);
  }

  return errors;
}

export function validateProductionEnv(env = process.env) {
  const errors = findLocalhostProductionEnvErrors(env);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to start in production with invalid environment configuration:\n${errors.join("\n")}`,
    );
  }
}
