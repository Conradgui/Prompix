import { expect, test } from '@playwright/test';

test('public-demo locks custom api entry while keeping demo flow available', async ({ page }) => {
  await page.goto('/');

  const homeApiButton = page.getByRole('button', { name: '自定义密钥' });
  await expect(homeApiButton).toBeDisabled();
  await expect(page.getByText('线上演示版仅开放免费试用，本地版可启用自定义接口。')).toBeVisible();

  await page.goto('/settings');

  const settingsApiButton = page.getByRole('button', { name: '自定义密钥' });
  await expect(settingsApiButton).toBeDisabled();
  await expect(page.getByText('线上演示版仅开放免费试用，本地版可启用自定义接口。')).toBeVisible();

  await expect(page.getByText('演示环境中接口配置为只读展示。')).toBeVisible();
  await expect(page.getByLabel('接口地址')).toBeDisabled();
  await expect(page.getByLabel('API Key')).toBeDisabled();
  await expect(page.getByLabel('分组 ID')).toBeDisabled();
});
