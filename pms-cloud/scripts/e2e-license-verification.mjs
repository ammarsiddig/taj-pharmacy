#!/usr/bin/env node

const baseUrl = (process.env.TAJ_E2E_BASE_URL || 'https://pharmacy.taj.systems').replace(/\/+$/, '');
const adminToken = process.env.PMS_ADMIN_TOKEN || process.env.TAJ_ADMIN_TOKEN;

if (!adminToken) {
  console.error('Missing PMS_ADMIN_TOKEN or TAJ_ADMIN_TOKEN.');
  process.exit(2);
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { res, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const pharmacyName = `E2E License Verification ${runId}`;
const ownerEmail = `e2e-license-${runId}@taj.systems`;
const ownerPassword = `E2E-${runId}-Pass1`;

let tenantId = '';
let licenseKey = '';
let existingOwnerKey = '';
let mismatchKey = '';

try {
  const create = await request('/admin/licenses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      pharmacy_name: pharmacyName,
      expires_in_days: 7,
      plan: 'basic',
      max_users: 2,
      max_branches: 1,
      create_new_tenant: true,
    }),
  });
  assert(create.res.ok, `create license failed: ${create.res.status} ${JSON.stringify(create.body)}`);
  assert(create.body?.key, 'create license did not return key');
  assert(create.body?.tenant_id, 'create license did not return tenant_id');
  licenseKey = create.body.key;
  tenantId = create.body.tenant_id;

  const activate = await request('/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      key: licenseKey,
      email: ownerEmail,
      password: ownerPassword,
      pharmacy_name: pharmacyName,
    }),
  });
  assert(activate.res.ok, `activation failed: ${activate.res.status} ${JSON.stringify(activate.body)}`);
  assert(activate.body?.sync_token, 'activation did not return sync_token');
  assert(activate.body?.tenant_id === tenantId, 'activation returned unexpected tenant_id');

  const activatedLicenses = await request(`/admin/tenants/${encodeURIComponent(tenantId)}/licenses`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    activatedLicenses.body?.keys?.some(item => item.key === licenseKey && item.status === 'used'),
    'activated license key was not marked used'
  );

  const config = await request('/v1/config', {
    headers: { Authorization: `Bearer ${activate.body.sync_token}` },
  });
  assert(config.res.ok, `sync token config check failed: ${config.res.status} ${JSON.stringify(config.body)}`);

  const createExistingOwnerKey = await request('/admin/licenses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenant_id: tenantId,
      expires_in_days: 14,
      plan: 'basic',
      max_users: 2,
      max_branches: 1,
    }),
  });
  assert(
    createExistingOwnerKey.res.ok,
    `create existing-owner license failed: ${createExistingOwnerKey.res.status} ${JSON.stringify(createExistingOwnerKey.body)}`
  );
  existingOwnerKey = createExistingOwnerKey.body.key;

  const activateExistingOwnerKey = await request('/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      key: existingOwnerKey,
      email: ownerEmail,
      password: ownerPassword,
      pharmacy_name: pharmacyName,
    }),
  });
  assert(
    activateExistingOwnerKey.res.ok,
    `existing-owner activation failed: ${activateExistingOwnerKey.res.status} ${JSON.stringify(activateExistingOwnerKey.body)}`
  );

  const existingOwnerLicenses = await request(`/admin/tenants/${encodeURIComponent(tenantId)}/licenses`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    existingOwnerLicenses.body?.keys?.some(item => item.key === existingOwnerKey && item.status === 'used'),
    'existing-owner activation did not consume pending key'
  );

  const createMismatchKey = await request('/admin/licenses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      tenant_id: tenantId,
      expires_in_days: 21,
      plan: 'basic',
      max_users: 2,
      max_branches: 1,
    }),
  });
  assert(createMismatchKey.res.ok, `create mismatch key failed: ${createMismatchKey.res.status} ${JSON.stringify(createMismatchKey.body)}`);
  mismatchKey = createMismatchKey.body.key;

  const mismatchActivation = await request('/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      key: mismatchKey,
      email: `wrong-owner-${runId}@taj.systems`,
      password: ownerPassword,
      pharmacy_name: pharmacyName,
    }),
  });
  assert(!mismatchActivation.res.ok, 'activation allowed a different owner email for an owned tenant');

  const replay = await request('/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      key: licenseKey,
      email: ownerEmail,
      password: ownerPassword,
      pharmacy_name: pharmacyName,
    }),
  });
  assert(!replay.res.ok, 'used license key was accepted on second activation');

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    tenantId,
    licenseKey,
    existingOwnerKey,
    mismatchStatus: mismatchActivation.res.status,
    replayStatus: replay.res.status,
  }, null, 2));
} finally {
  if (tenantId) {
    const cleanup = await request(`/admin/tenants/${encodeURIComponent(tenantId)}?hard=true&confirm=${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!cleanup.res.ok) {
      console.error(`cleanup failed for ${tenantId}: ${cleanup.res.status} ${JSON.stringify(cleanup.body)}`);
      process.exitCode = 1;
    }
  } else if (licenseKey) {
    await request(`/admin/licenses/${encodeURIComponent(licenseKey)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
}
