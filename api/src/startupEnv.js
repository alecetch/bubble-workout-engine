const WEAK_SECRET_VALUES = new Set(["change-me", "secret", "password", "app", "minioadmin"]);

export function isWeakSecret(value, minLength = 12) {
  const text = (value || "").toString().trim();
  if (!text) return true;
  return text.length < minLength || WEAK_SECRET_VALUES.has(text.toLowerCase());
}

export function getStartupEnvErrors(env = process.env) {
  const errors = [];
  const internalApiToken = (env.INTERNAL_API_TOKEN || "").trim();
  const jwtSecret = (env.JWT_SECRET || "").trim();
  const jwtIssuer = (env.JWT_ISSUER || "").trim();
  const databaseUrl = (env.DATABASE_URL || "").trim();
  const pgHost = (env.PGHOST || "").trim();
  const pgUser = (env.PGUSER || "").trim();
  const pgPassword = (env.PGPASSWORD || "").trim();
  const pgDatabase = (env.PGDATABASE || "").trim();

  if (isWeakSecret(internalApiToken, 16)) {
    errors.push("INTERNAL_API_TOKEN is missing, too short, or uses a weak default.");
  }
  if (isWeakSecret(jwtSecret, 32)) {
    errors.push("JWT_SECRET is missing, too short, or uses a weak default.");
  }
  if (!jwtIssuer) {
    errors.push("JWT_ISSUER is missing.");
  }

  if (databaseUrl) {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      errors.push("DATABASE_URL is present but is not a valid URL.");
      return errors;
    }
    if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:")) {
      errors.push("DATABASE_URL must use postgres:// or postgresql://.");
    }
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
      errors.push("DATABASE_URL must include host and database name.");
    }
    if (isWeakSecret(parsed.password, 8)) {
      errors.push("DATABASE_URL contains a missing, too short, or weak database password.");
    }
    return errors;
  }

  if (!pgHost || !pgUser || !pgPassword || !pgDatabase) {
    errors.push("Database configuration is missing. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.");
  }
  if (isWeakSecret(pgPassword, 8)) {
    errors.push("PGPASSWORD is too short or uses a weak default.");
  }
  return errors;
}
