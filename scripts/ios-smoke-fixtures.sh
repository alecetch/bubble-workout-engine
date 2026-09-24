#!/usr/bin/env bash
set -euo pipefail
# Deliberately local: no Docker services, production DB, or external AI credentials.
[[ "$PGHOST" == "127.0.0.1" && "$PGDATABASE" == "workout_test" ]]
[[ -z "${OPENAI_API_KEY:-}" && -z "${DATABASE_URL:-}" ]]
initdb -D "$RUNNER_TEMP/ios-smoke-pg" -U "$PGUSER" --auth-local=trust --auth-host=trust
pg_ctl -D "$RUNNER_TEMP/ios-smoke-pg" -l "$GITHUB_WORKSPACE/artifacts/ios-smoke/postgres.log" -o "-h 127.0.0.1 -p $PGPORT" -w start
createdb "$PGDATABASE"
"$RUNNER_TEMP/flyway-$FLYWAY_VERSION/flyway" \
  -url="jdbc:postgresql://127.0.0.1:$PGPORT/$PGDATABASE" \
  -user="$PGUSER" -password="$PGPASSWORD" \
  -locations="filesystem:$GITHUB_WORKSPACE/migrations" migrate \
  2>&1 | tee artifacts/ios-smoke/migrations.log
node api/server.js > artifacts/ios-smoke/api.log 2>&1 &
echo $! > "$RUNNER_TEMP/ios-smoke-api.pid"
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:3000/health > /dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:3000/health
API_URL=http://127.0.0.1:3000 bash scripts/provision-e2e-db.sh
