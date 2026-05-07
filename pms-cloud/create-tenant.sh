#!/bin/bash
# Create first tenant and generate sync token
ADMIN_TOKEN=$(grep PMS_ADMIN_TOKEN /opt/pms-cloud/.env | cut -d= -f2)

echo "Creating tenant: default-tenant"
curl -s -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"tenant_id":"default-tenant","label":"pharmacy-client-1"}'
echo ""
echo ""
echo "Done. Copy the 'token' value above and set it as PMS_OWNER_SYNC_TOKEN in your desktop app."
