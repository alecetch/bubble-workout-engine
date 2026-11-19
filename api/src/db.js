// api/src/db.js
import pg from "pg";
import * as Sentry from "@sentry/node";
import logger from "./utils/logger.js";

const { Pool } = pg;
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

const poolConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

export function createPool(config, {
  log = logger,
  now = Date.now,
  addBreadcrumb = Sentry.addBreadcrumb,
} = {}) {
  const instance = new Pool({
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...config,
  });
  const checkedOut = new WeakSet();
  const warnings = new Map();
  function report(event, err) {
    const code = err.code ?? "unknown";
    const time = now();
    const previous = warnings.get(code);
    if (previous && time - previous.at < 10_000) {
      previous.suppressed++;
      return;
    }
    warnings.set(code, { at: time, suppressed: 0 });
    log.warn({ event, code: err.code, message: err.message, suppressed: previous?.suppressed ?? 0 });
    addBreadcrumb({ category: "db", level: "warning", message: code });
  }
  instance.on("error", err => report("db.pool.idle_client_error", err));
  instance.on("acquire", client => checkedOut.add(client));
  instance.on("release", (_err, client) => checkedOut.delete(client));
  instance.on("connect", client => {
    client.on("error", err => {
      // Idle clients also emit on the pool. Let that handler report the idle
      // event once; checked-out clients have no pool error handler attached.
      if (checkedOut.has(client)) report("db.client.error", err);
    });
  });
  return instance;
}

export const pool = createPool(poolConfig);
