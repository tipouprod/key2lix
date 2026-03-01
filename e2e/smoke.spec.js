/**
 * P27: اختبارات E2E أساسية (Playwright)
 * تشغيل: npx playwright test
 */
const { test, expect } = require('@playwright/test');

test.describe('Key2lix smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Key2lix/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('products page loads', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveTitle(/Key2lix/i);
    await expect(page.locator('main, #main-content, .products-page').first()).toBeVisible({ timeout: 5000 });
  });

  test('cart page loads', async ({ page }) => {
    await page.goto('/cart');
    await expect(page).toHaveTitle(/Key2lix/i);
  });

  test('support page loads', async ({ page }) => {
    await page.goto('/support');
    await expect(page).toHaveTitle(/Key2lix/i);
  });

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/health');
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.db).toBe('connected');
  });
});
