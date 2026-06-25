/**
 * One-shot migration runner for use inside the Fly app container.
 * Usage: node scripts/run-migration.mjs
 * Reads DATABASE_URL from environment.
 */
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("Connected to database.");

const migrations = [
  {
    version: "V111",
    name: "extend_cs_athletes_outreach_fields",
    sql: `
      ALTER TABLE cs_athletes
        ADD COLUMN IF NOT EXISTS follower_band               TEXT,
        ADD COLUMN IF NOT EXISTS primary_market              TEXT,
        ADD COLUMN IF NOT EXISTS hyrox_role                  TEXT,
        ADD COLUMN IF NOT EXISTS follower_count_source       TEXT,
        ADD COLUMN IF NOT EXISTS forma_target_recommendation TEXT,
        ADD COLUMN IF NOT EXISTS targeting_reason            TEXT,
        ADD COLUMN IF NOT EXISTS source_url                  TEXT;
    `,
  },
  {
    version: "V111b",
    name: "cs_athletes_instagram_unique",
    sql: `
      DO $$ BEGIN
        ALTER TABLE cs_athletes ADD CONSTRAINT cs_athletes_instagram_handle_unique UNIQUE (instagram_handle);
      EXCEPTION WHEN duplicate_table THEN NULL; END $$;
    `,
  },
];

for (const m of migrations) {
  try {
    await client.query(m.sql);
    console.log(`✓ ${m.version} ${m.name}`);
  } catch (err) {
    console.error(`✗ ${m.version} ${m.name}: ${err.message}`);
  }
}

await client.end();
console.log("Done.");
