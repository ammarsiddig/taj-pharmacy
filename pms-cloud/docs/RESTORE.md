# Cloud Database Restore Runbook

## Restore most recent backup

1. SSH to the VPS as root
2. Stop the API: `docker compose stop pms-api`
3. Find newest dump: `ls -lt /var/backups/pms-postgres/pms-*.dump | head -1`
4. Restore: `cat <dump> | docker exec -i pms-postgres pg_restore -U pms -d pms_cloud --clean --if-exists`
5. Restore tenant backup files (if available): `tar xzf <pms-files-*.tar.gz> -C /data`
6. Restart API: `docker compose start pms-api`
7. Verify: `curl https://taj.systems/health`

## Restore from offsite

1. `rclone copy remote:pms-postgres-backups/<filename> /tmp/`
2. Follow steps above with `/tmp/<filename>`

## Manual backup (ad-hoc)

```bash
/opt/pms/backup-postgres.sh
```

## Verify backup integrity

```bash
# List contents of latest dump
docker run --rm -v /var/backups/pms-postgres:/dumps:ro postgres:16-alpine \
  pg_restore --list /dumps/$(ls -t /var/backups/pms-postgres/pms-*.dump | head -1 | xargs basename) | head -20

# Check offsite copy exists
rclone ls remote:pms-postgres-backups/ | tail -5
```
