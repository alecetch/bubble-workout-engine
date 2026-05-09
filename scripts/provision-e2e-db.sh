#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  API_URL
  ENGINE_KEY
  E2E_EMAIL
  E2E_PASSWORD
  PGHOST
  PGPORT
  PGUSER
  PGPASSWORD
  PGDATABASE
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

json_field() {
  local file="$1"
  local field="$2"
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const value = data[process.argv[2]];
    if (value == null || value === '') process.exit(1);
    process.stdout.write(String(value));
  " "$file" "$field"
}

post_json() {
  local url="$1"
  local body="$2"
  local output="$3"
  shift 3

  local status
  status="$(
    curl -sS -o "$output" -w '%{http_code}' \
      -X POST "$url" \
      -H 'content-type: application/json' \
      "$@" \
      --data "$body"
  )"

  printf '%s' "$status"
}

auth_body="{\"email\":$(json_escape "$E2E_EMAIL"),\"password\":$(json_escape "$E2E_PASSWORD")}"
auth_response="$tmp_dir/auth.json"

echo "Provisioning E2E account ${E2E_EMAIL}"
status="$(post_json "${API_URL}/api/auth/register" "$auth_body" "$auth_response")"
if [[ "$status" == "409" ]]; then
  status="$(post_json "${API_URL}/api/auth/login" "$auth_body" "$auth_response")"
fi

if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
  echo "Auth provisioning failed with HTTP ${status}" >&2
  cat "$auth_response" >&2 || true
  exit 1
fi

user_id="$(json_field "$auth_response" user_id)"
client_profile_id="$(json_field "$auth_response" client_profile_id)"
access_token="$(json_field "$auth_response" access_token)"

echo "Patching client profile ${client_profile_id}"
psql -v ON_ERROR_STOP=1 <<SQL
UPDATE client_profile SET
  main_goals_slugs          = ARRAY['strength'],
  fitness_level_slug        = 'intermediate',
  fitness_rank              = 1,
  equipment_preset_slug     = 'commercial_gym',
  equipment_items_slugs     = ARRAY['barbell','dumbbell','bench','rack','cable','lat_pulldown','leg_press'],
  preferred_days            = ARRAY['mon','wed','fri'],
  minutes_per_session       = 60,
  height_cm                 = 180,
  weight_kg                 = 80,
  sex                       = 'male',
  age_range                 = '30-39',
  program_type_slug         = 'strength',
  onboarding_step_completed = 3,
  onboarding_completed_at   = COALESCE(onboarding_completed_at, now()),
  anchor_lifts_skipped      = true,
  updated_at                = now()
WHERE id = '${client_profile_id}';
SQL

active_response="$tmp_dir/active-programs.json"
active_status="$(
  curl -sS -o "$active_response" -w '%{http_code}' \
    -H "authorization: Bearer ${access_token}" \
    "${API_URL}/api/programs/active"
)"

program_id=""
if [[ "$active_status" -ge 200 && "$active_status" -lt 300 ]]; then
  program_id="$(
    node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      const program = Array.isArray(data.programs) ? data.programs[0] : null;
      if (program?.program_id) process.stdout.write(program.program_id);
    " "$active_response"
  )"
fi

if [[ -z "$program_id" ]]; then
  echo "Generating E2E Strength Block"
  anchor_date_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  generate_body="{\"user_id\":$(json_escape "$user_id"),\"client_profile_id\":$(json_escape "$client_profile_id"),\"programType\":\"strength\",\"anchor_date_ms\":${anchor_date_ms}}"
  generate_response="$tmp_dir/generate.json"
  status="$(post_json "${API_URL}/generate-plan-v2" "$generate_body" "$generate_response" -H "x-engine-key: ${ENGINE_KEY}")"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "Program generation failed with HTTP ${status}" >&2
    cat "$generate_response" >&2 || true
    exit 1
  fi

  program_id="$(json_field "$generate_response" program_id)"
fi

echo "Activating program ${program_id} as Strength Block"
psql -v ON_ERROR_STOP=1 <<SQL
UPDATE program
SET program_title = 'Strength Block',
    status = 'active',
    is_primary = true
WHERE id = '${program_id}';
SQL

echo "E2E account ready: user_id=${user_id} client_profile_id=${client_profile_id} program_id=${program_id}"
