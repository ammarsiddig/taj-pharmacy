#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/var/backups/pms-postgres
RETAIN_DAYS=14

mkdir -p "$BACKUP_DIR"

# Dump PostgreSQL from the docker container
docker exec pms-postgres pg_dump -U pms -Fc pms_cloud \
  > "$BACKUP_DIR/pms-$TIMESTAMP.dump"

# Backup tenant-uploaded files from the pms-data volume
# (adjust /var/lib/docker/volumes/pms_pms-data/_data if the VPS uses named volumes)
if [ -d /data/backups ]; then
  tar czf "$BACKUP_DIR/pms-files-$TIMESTAMP.tar.gz" -C /data backups
fi

# Prune local backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "pms-*" -mtime +$RETAIN_DAYS -delete

# Offsite copy via rclone (configure once with `rclone config`)
if command -v rclone &> /dev/null; then
  rclone copy "$BACKUP_DIR" remote:pms-postgres-backups/ --include "pms-*$TIMESTAMP*"
fi
