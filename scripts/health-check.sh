#!/usr/bin/env bash
set -euo pipefail

API_URL=${1:-"http://localhost:3001/api/health"}

STATUS=$(curl -sS "$API_URL" | jq -r '.status' || echo "error")
if [[ "$STATUS" == "ok" ]]; then
  echo "API healthy"
  exit 0
else
  echo "API unhealthy"
  exit 1
fi






