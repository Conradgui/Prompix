import { expect, test } from '@playwright/test';

test('demo mode is available out of box', async ({ page }) => {
  await page.goto('/');

  const demoBtn = page.locator('button:has-text("免费试用"):visible').first();
  const apiBtn = page.locator('button:has-text("自定义API"):visible').first();
  await expect(demoBtn).toBeVisible();
  await expect(apiBtn).toBeVisible();

  await apiBtn.click();
  await page.locator('[title="Settings"]:visible').first().click();

  await expect(page.getByText('Prompix 运行模式')).toBeVisible();
  await expect(page.getByText('自定义 API 配置')).toBeVisible();
});
