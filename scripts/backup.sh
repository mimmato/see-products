#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${1:-"./backups"}
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="$BACKUP_DIR/price_tracker_${TIMESTAMP}.sql.gz"

echo "Creating database backup at $FILE"
PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "${DB_HOST:-localhost}" -U "${DB_USER:-priceuser}" -d "${DB_NAME:-prices}" | gzip > "$FILE"
echo "Backup completed: $FILE"






