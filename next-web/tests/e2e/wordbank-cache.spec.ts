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

test('wordbank prefetches uncached terms once and avoids extra calls after revisit', async ({ page }) => {
  let explainCallCount = 0;

  await page.route('**/api/managed/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ analysis: MOCK_ANALYSIS }),
    });
  });

  await page.route('**/api/managed/explain-term', async (route) => {
    explainCallCount += 1;
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
        meta: { thinking: '先确定术语边界，再给出应用。' },
      }),
    });
  });

  await page.goto('/');
  const fixture = path.resolve(process.cwd(), 'tests/e2e/fixtures/test-image.png');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/analysis/);

  await page.goto('/wordbank');
  await expect(page.getByText('术语预生成中：')).toBeVisible();
  await expect(page.getByText('术语解释已缓存，可直接切换浏览。')).toBeVisible({ timeout: 15000 });
  expect(explainCallCount).toBeGreaterThan(0);

  const afterFirstPrefetch = explainCallCount;

  await page.reload();
  await expect(page.getByText('术语解释已缓存，可直接切换浏览。')).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(600);
  expect(explainCallCount).toBe(afterFirstPrefetch);

  await page.getByRole('button', { name: '电影感 风格', exact: true }).click();
  await expect(page.getByText('电影感 的定义')).toBeVisible();
});
