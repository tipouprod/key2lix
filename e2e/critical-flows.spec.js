/**
 * P1: E2E tests for critical user flows
 * تشغيل: npx playwright test e2e/critical-flows.spec.js
 * للاختبار مع تسجيل الدخول: TEST_CLIENT_EMAIL=... TEST_CLIENT_PASSWORD=... npx playwright test
 */
const { test, expect } = require('@playwright/test');

test.describe('Critical user flows', () => {
  test('Home → Products → Product → Cart → Order form (or login redirect)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Key2lix/i);

    await page.goto('/products');
    await expect(page.locator('.products-page, #main-content, main')).toBeVisible({ timeout: 8000 });

    // If products exist, click first product link
    const productLink = page.locator('a[href*="/product.html"]').first();
    const hasProducts = await productLink.count() > 0;
    if (!hasProducts) {
      // No products — verify empty state or page structure
      await expect(page.locator('.products-page, #products-empty, .products-toolbar')).toBeVisible({ timeout: 3000 });
      return;
    }

    await productLink.click();
    await expect(page).toHaveURL(/\/product\.html/);
    await expect(page.locator('#product-name, .product-container, h1')).toBeVisible({ timeout: 5000 });

    // Add to cart first, then go to cart
    const addToCartBtn = page.locator('#add-to-cart-btn, #add-to-cart-btn-sticky, button:has-text("أضف للسلة"), button:has-text("Add to cart")').first();
    if (await addToCartBtn.count() > 0) {
      await addToCartBtn.click();
      await page.goto('/cart');
      await expect(page).toHaveURL(/\/cart/);
      const orderBtn = page.locator('a.cart-item-order, .btn-order-now').first();
      if (await orderBtn.count() > 0) {
        await orderBtn.click();
        await expect(page).toHaveURL(/\/(form\.html|client-login)/, { timeout: 5000 });
      }
    } else {
      // Fallback: Order Now → form
      const orderLink = page.locator('#order-btn, #order-btn-sticky, a[href*="form.html"]').first();
      if (await orderLink.count() > 0) {
        await orderLink.click();
        await expect(page).toHaveURL(/\/(form\.html|client-login)/, { timeout: 5000 });
      }
    }
  });

  test('Cart page displays correctly', async ({ page }) => {
    await page.goto('/cart');
    await expect(page).toHaveTitle(/Key2lix/i);
    await expect(page.locator('.cart-page, .cart-hero, #cart-empty, #cart-list-wrap')).toBeVisible({ timeout: 5000 });
  });

  test('Login → My Account → Orders section', async ({ page }) => {
    const email = process.env.TEST_CLIENT_EMAIL || '';
    const password = process.env.TEST_CLIENT_PASSWORD || '';
    if (!email || !password) {
      test.skip();
      return;
    }

    await page.goto('/client-login');
    await expect(page).toHaveURL(/client-login/);
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary');
    await expect(page).toHaveURL(/\/(client-account|\?)/, { timeout: 8000 });

    // Client account page shows orders section or guest message
    await expect(page.locator('.account-page, .account-guest, .account-orders, #orders-section')).toBeVisible({ timeout: 5000 });
  });

  test('Form page loads (with product params)', async ({ page }) => {
    await page.goto('/form.html?product=Test&value=1000&product_key=test&category=game_cards');
    // Logged-out users get redirected to client-login
    await expect(page).toHaveURL(/\/(form\.html|client-login)/, { timeout: 6000 });
    await expect(page.locator('body')).toBeVisible();
  });
});
