import path from 'node:path';
import { expect, test } from '@playwright/test';

const MOCK_ANALYSIS = {
  description: '未来城市夜景海报',
  structuredPrompts: {
    subject: { original: '银发女性, 黑色风衣', translated: '' },
    environment: { original: '雨夜街道, 霓虹反射', translated: '' },
    composition: { original: '三分法构图, 低机位', translated: '' },
    lighting: { original: '冷色主光, 轮廓光', translated: '' },
    mood: { original: '克制, 孤独', translated: '' },
    style: { original: '电影感, 超写实', translated: '' },
  },
};

test('settings can clear legacy history and wordbank cache', async ({ page }) => {
  await page.route('**/api/managed/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ analysis: MOCK_ANALYSIS }),
    });
  });

  await page.route('**/api/managed/explain-term', async (route) => {
    const body = route.request().postDataJSON() as any;
    const term = String(body?.term || '术语');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        explanation: {
          def: `${term} 的定义`,
          app: `${term} 的应用建议`,
        },
      }),
    });
  });

  await page.goto('/');
  const fixture = path.resolve(process.cwd(), 'tests/e2e/fixtures/test-image.png');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/analysis/);

  await page.goto('/wordbank');
  await expect(page.getByText('术语列表')).toBeVisible();
  await expect(page.getByRole('button', { name: '电影感 风格', exact: true })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('缓存清理')).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: '清空旧历史缓存' }).click();
  await expect(page.getByText('已清空旧历史与术语缓存。')).toBeVisible();

  await page.goto('/wordbank');
  await expect(page.getByText('术语列表')).toBeVisible();
  await expect(page.getByRole('button', { name: '电影感 风格', exact: true })).toHaveCount(0);
  await expect(page.getByText('Demo 已刷新')).toHaveCount(0);
});
