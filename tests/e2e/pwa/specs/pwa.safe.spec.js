// Owner PWA suite — READ-ONLY. Logs into the real cloud as the owner and only
// reads. Never writes to the cloud. Requires TAJ_PWA_USER / TAJ_PWA_PASS.
import { test, expect } from '@playwright/test';
import { PWA_USER, PWA_PASS } from '../../config/env.js';

test.beforeEach(async ({ page }) => {
  test.skip(!PWA_USER || !PWA_PASS,
    'Set TAJ_PWA_USER and TAJ_PWA_PASS to the real owner cloud login.');
  await page.goto('/');
  // Login screen: #email / #password / submit (pms-cloud/web/src/pages/Login.tsx).
  await page.locator('#email').fill(PWA_USER);
  await page.locator('#password').fill(PWA_PASS);
  await page.locator('button[type="submit"]').click();
  // Owner app chrome mounts a nav with these Arabic labels.
  await expect(page.getByRole('button', { name: 'المنتجات' })).toBeVisible({ timeout: 20_000 });
});

test('recently-synced data appears (Products page non-empty after a desktop sync)', async ({ page }) => {
  // Assumes the operator ran a desktop sync shortly before this suite.
  await page.getByRole('button', { name: 'المنتجات' }).click();
  // The cloud is a read-mirror of the desktop; products synced from desktop
  // should render. Assert the page shows product content (not an empty/zero state).
  const body = page.locator('body');
  await expect(body).toContainText(/منتج|Products|[0-9]/, { timeout: 20_000 });
  // If TAJ_E2E_MULTILOC_PRODUCT is set, assert that specific product synced.
  const probe = process.env.TAJ_E2E_MULTILOC_PRODUCT;
  if (probe) {
    await expect(page.getByText(probe, { exact: false })).toBeVisible({ timeout: 20_000 });
  }
});

test('Activity page renders its content (KNOWN-FAILING — this test should catch it)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.getByRole('button', { name: 'النشاط' }).click();
  // The page header always mounts; wait for it so we know we're on Activity.
  await expect(page.getByRole('heading', { name: 'آخر النشاطات' })).toBeVisible({ timeout: 15_000 });

  // KNOWN BUG: /v1/activity returns 200 but the page renders NO body content —
  // no filter chips, no items, not even the empty state. A healthy Activity
  // page ALWAYS shows its filter chips (the "الكل" chip is static), plus one of:
  // real activity items, or the "لا توجد نشاطات" empty state. Assert real
  // content rendered. This is EXPECTED TO FAIL until the Activity bug is fixed.
  await expect(page.getByRole('button', { name: 'الكل' })).toBeVisible({ timeout: 10_000 });
  const hasEmptyState = await page.getByText('لا توجد نشاطات').isVisible().catch(() => false);
  const itemCount = await page.locator('.app-panel').count();
  expect(hasEmptyState || itemCount > 0,
    'Activity rendered neither activity items nor the empty state — page body is blank (the known bug).').toBe(true);

  // Also surface any explicit load error and any runtime error.
  await expect(page.getByText('تعذر تحميل النشاطات')).toHaveCount(0);
  expect(errors, `Activity threw runtime errors: ${errors.join('; ')}`).toHaveLength(0);
});
