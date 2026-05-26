'use strict';

const { test, expect } = require('@playwright/test');

const CUSTOMER_URL = 'http://localhost:13000';
const BACKEND_URL = 'http://localhost:18000';

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND_URL}/queue/clear`);
});

test.describe('Customer – 取號流程', () => {
  test('頁面載入並顯示取號標題', async ({ page }) => {
    await page.goto(CUSTOMER_URL);
    await expect(page.getByText('線上取號')).toBeVisible({ timeout: 15000 });
  });

  test('點擊我要取號後顯示候位資訊', async ({ page }) => {
    await page.goto(CUSTOMER_URL);
    // Wait until liffReady (ALLOW_BROWSER_QUEUE=1 skips LIFF init)
    const takeBtn = page.getByRole('button', { name: '我要取號' });
    await expect(takeBtn).toBeVisible({ timeout: 15000 });
    await takeBtn.click();

    // After taking a number, the statusText div should show "等待叫號中"
    await expect(page.locator('.statusText').getByText('等待叫號中')).toBeVisible({ timeout: 10000 });
  });

  test('取號後「我要取號」按鈕不再顯示', async ({ page }) => {
    await page.goto(CUSTOMER_URL);
    const takeBtn = page.getByRole('button', { name: '我要取號' });
    await expect(takeBtn).toBeVisible({ timeout: 15000 });
    await takeBtn.click();
    await expect(takeBtn).not.toBeVisible({ timeout: 10000 });
  });

  test('可點擊查看預選餐點進入 menu 頁', async ({ page }) => {
    await page.goto(CUSTOMER_URL);
    const menuBtn = page.getByRole('button', { name: /查看.*預選餐點|修改預選餐點/ });
    await expect(menuBtn).toBeVisible({ timeout: 15000 });
    await menuBtn.click();
    await expect(page).toHaveURL(/\/menu/, { timeout: 10000 });
  });
});
