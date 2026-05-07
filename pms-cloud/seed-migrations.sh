#!/bin/bash
docker exec pms-postgres psql -U pms -d pms_cloud -c "INSERT INTO schema_migrations (filename) VALUES ('001_initial_postgres.sql') ON CONFLICT DO NOTHING"
echo "Done"
