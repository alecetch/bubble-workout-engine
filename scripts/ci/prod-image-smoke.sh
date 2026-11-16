#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-api-prod:ci}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-smoke}"
PGPASSWORD="${PGPASSWORD:-smoke-db-password-ci-only}"
PGDATABASE="${PGDATABASE:-smoke}"
cleanup() {
  docker logs api-smoke 2>&1 || true
  docker rm -f api-smoke >/dev/null 2>&1 || true
  rm -rf "$probe_dir"
}
probe_dir="$(mktemp -d)"
trap cleanup EXIT
fail() { echo "FAIL $*" >&2; exit 1; }

echo "Checking production release command"
docker run --rm --network host \
  -e "DATABASE_URL=postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE?sslmode=disable" \
  "$IMAGE" node scripts/migrate.mjs
echo "PASS release command"

runtime_env=(
  -e NODE_ENV=production -e "PGHOST=$PGHOST" -e "PGPORT=$PGPORT" -e "PGUSER=$PGUSER"
  -e "PGPASSWORD=$PGPASSWORD" -e "PGDATABASE=$PGDATABASE"
  -e JWT_SECRET=ci-smoke-jwt-secret-at-least-32-characters-long
  -e JWT_ISSUER=ci-smoke -e INTERNAL_API_TOKEN=ci-smoke-internal-token-1234
  -e APP_DOMAIN=https://ci-smoke.invalid
)
docker run --rm --network host "${runtime_env[@]}" "$IMAGE" node scripts/smoke-runtime.mjs
docker run -d --name api-smoke --network host "${runtime_env[@]}" -e PORT=3000 "$IMAGE" >/dev/null

ready=false
for ((attempt=0; attempt<30; attempt++)); do
  [[ "$(docker inspect --format '{{.State.Running}}' api-smoke)" == true ]] || fail "API exited before becoming healthy"
  if curl --max-time 2 -fsS http://127.0.0.1:3000/health >"$probe_dir/health"; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || fail "API did not become healthy within 60 seconds"

probe() {
  local route="$1" code
  code="$(curl --max-time 10 -sS -D "$probe_dir/headers" -o "$probe_dir/body" -w '%{http_code}' "http://127.0.0.1:3000$route")" || fail "GET $route failed"
  if [[ "$route" == /api/app-config && "$code" == 404 ]]; then echo "SKIP app-config (route not present)"; return; fi
  [[ "$code" == 200 ]] || fail "GET $route returned $code instead of 200"
  if [[ "$route" == /health ]]; then
    grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$probe_dir/body" || fail "health body has no ok:true"
    grep -q '"dbTime"' "$probe_dir/body" || fail "health body has no dbTime"
  elif [[ "$route" != /api/app-config ]]; then
    grep -Eiq '^content-type:.*text/html' "$probe_dir/headers" || fail "GET $route is not text/html"
  fi
  echo "PASS probe $route (200)"
}
probe /health
probe /hyrox-calculator
probe /privacy
probe /api/app-config
logs="$(docker logs api-smoke 2>&1)"
grep -q 'server.listening' <<<"$logs" || fail "missing server.listening log"
if grep -q 'server.startup.fatal' <<<"$logs"; then fail "server.startup.fatal in boot logs"; fi
echo "PASS startup logs"
