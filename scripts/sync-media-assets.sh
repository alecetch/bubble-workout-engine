#!/usr/bin/env bash
set -euo pipefail

# Sync assets/media-assets/ to Cloudflare R2 via S3-compatible AWS CLI.
# Required env vars:
# - R2_ACCOUNT_ID
# - R2_ACCESS_KEY_ID
# - R2_SECRET_ACCESS_KEY
# Optional:
# - R2_BUCKET (defaults to media-assets)
# - SOURCE_DIR (defaults to assets/media-assets)
# - EXTRA_SYNC_ARGS (optional extra aws s3 sync flags)

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install AWS CLI before running this script."
  exit 1
fi

R2_BUCKET="${R2_BUCKET:-media-assets}"
SOURCE_DIR="${SOURCE_DIR:-assets/media-assets}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
DESTINATION_URI="s3://${R2_BUCKET}"

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "Source directory does not exist: ${SOURCE_DIR}"
  exit 1
fi

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"

echo "Starting media asset sync"
echo "Source: ${SOURCE_DIR}"
echo "Destination: ${DESTINATION_URI}"
echo "Endpoint: ${R2_ENDPOINT}"
echo "Delete mode: disabled (safe default)"

set -x
aws s3 sync "${SOURCE_DIR}/" "${DESTINATION_URI}/" \
  --endpoint-url "${R2_ENDPOINT}" \
  --exact-timestamps \
  ${EXTRA_SYNC_ARGS:-}
set +x

echo "Media asset sync complete."
