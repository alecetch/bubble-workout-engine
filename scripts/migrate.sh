#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run Flyway migrations"
  exit 1
fi

JDBC_URL=""
DB_USER=""
DB_PASSWORD=""

if [ -n "${DATABASE_URL:-}" ]; then
  # Convert postgres:// / postgresql:// URL into a Flyway JDBC URL.
  # Enforce sslmode=require for managed Postgres connections.
  JDBC_URL="$(node -e '
const raw = process.env.DATABASE_URL || "";
if (!raw) {
  process.stderr.write("DATABASE_URL is empty\n");
  process.exit(1);
}
const u = new URL(raw);
if (!u.protocol || !u.protocol.startsWith("postgres")) {
  process.stderr.write("DATABASE_URL must use postgres:// or postgresql://\n");
  process.exit(1);
}
if (!u.searchParams.has("sslmode")) {
  u.searchParams.set("sslmode", "require");
}
const jdbc = `jdbc:postgresql://${u.host}${u.pathname}${u.search}`;
process.stdout.write(jdbc);
')"

  DB_USER="$(node -e '
const raw = process.env.DATABASE_URL || "";
const u = new URL(raw);
process.stdout.write(decodeURIComponent(u.username || ""));
')"

  DB_PASSWORD="$(node -e '
const raw = process.env.DATABASE_URL || "";
const u = new URL(raw);
process.stdout.write(decodeURIComponent(u.password || ""));
')"
else
  : "${PGHOST:?PGHOST is required}"
  : "${PGPORT:=5432}"
  : "${PGDATABASE:?PGDATABASE is required}"
  : "${PGUSER:?PGUSER is required}"
  : "${PGPASSWORD:?PGPASSWORD is required}"

  JDBC_URL="jdbc:postgresql://${PGHOST}:${PGPORT}/${PGDATABASE}"
  DB_USER="${PGUSER}"
  DB_PASSWORD="${PGPASSWORD}"
fi

FLYWAY_COMMON_ARGS=(
  --rm
  --network host
  -v "$(pwd)/migrations:/flyway/sql:ro"
  flyway/flyway:12
  -url="${JDBC_URL}"
  -user="${DB_USER}"
  -password="${DB_PASSWORD}"
  -schemas=public
  -ignoreMigrationPatterns="*:missing"
)

# Repair first: updates checksums in schema history for any migrations whose files
# changed after being applied (e.g. placeholder rows with checksum 0).
docker run "${FLYWAY_COMMON_ARGS[@]}" repair

# When connecting via a proxy (e.g. Fly MPG), each Docker Flyway container opens a
# fresh TCP connection. The proxy can briefly reset after the repair container exits,
# causing the migrate container to get an EOF on connect. A short pause lets it settle.
sleep 3

docker run "${FLYWAY_COMMON_ARGS[@]}" migrate
