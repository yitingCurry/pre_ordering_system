'use strict';

const { test, expect } = require('@playwright/test');

const STAFF_URL = 'http://localhost:13001';
const BACKEND_URL = 'http://localhost:18000';

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND_URL}/queue/clear`);
});

test.describe('Staff – 隊列管理', () => {
  test('頁面載入並顯示隊列清單標題', async ({ page }) => {
    await page.goto(STAFF_URL);
    await expect(page.getByText('隊列清單')).toBeVisible({ timeout: 15000 });
  });

  test('無號碼時顯示空隊列提示', async ({ page }) => {
    await page.goto(STAFF_URL);
    await expect(page.getByText(/目前無號碼/).first()).toBeVisible({ timeout: 15000 });
  });

  test('叫號按鈕存在並可點擊', async ({ page }) => {
    await page.goto(STAFF_URL);
    const callBtn = page.getByRole('button', { name: /叫 1–2 位/ });
    await expect(callBtn).toBeVisible({ timeout: 15000 });
  });

  test('叫號後顯示「已叫號」狀態', async ({ request, page }) => {
    // Seed a queue entry
    await request.post(`${BACKEND_URL}/queue`, {
      data: { deviceToken: 'e2e-staff-dev', partySize: 1 }
    });

    await page.goto(STAFF_URL);
    await expect(page.getByText('等待中')).toBeVisible({ timeout: 15000 });

    const callBtn = page.getByRole('button', { name: /叫 1–2 位/ });
    await callBtn.click();

    await expect(page.getByText('已叫號')).toBeVisible({ timeout: 10000 });
  });

  test('叫號後「入座」按鈕出現', async ({ request, page }) => {
    await request.post(`${BACKEND_URL}/queue`, {
      data: { deviceToken: 'e2e-staff-seat', partySize: 2 }
    });

    await page.goto(STAFF_URL);
    await page.getByRole('button', { name: /叫 1–2 位/ }).click();

    await expect(page.getByRole('button', { name: '入座' })).toBeVisible({ timeout: 10000 });
  });

  test('清空今日列隊後隊列為空', async ({ request, page }) => {
    await request.post(`${BACKEND_URL}/queue`, {
      data: { deviceToken: 'e2e-clear-dev', partySize: 1 }
    });

    await page.goto(STAFF_URL);
    await expect(page.getByText('等待中')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: '清空今日列隊' }).click();
    // Confirmation button should appear
    const confirmBtn = page.getByRole('button', { name: /確認清空/ });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    await expect(page.getByText(/目前無號碼/).first()).toBeVisible({ timeout: 10000 });
  });
});
