// api/src/db.js
import pg from "pg";

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

export const pool = new Pool({
  ...poolConfig,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
