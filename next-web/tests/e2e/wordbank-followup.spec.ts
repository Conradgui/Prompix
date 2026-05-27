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

test('wordbank follow-up thread is isolated per term and supports clear action', async ({ page }) => {
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
        meta: { thinking: '思考：先解释，再应用。' },
      }),
    });
  });

  await page.route('**/api/managed/term-followup', async (route) => {
    const body = route.request().postDataJSON() as any;
    const term = String(body?.term || '术语');
    const message = String(body?.message || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `围绕 ${term} 的追问回复：${message}`,
        meta: { thinking: `思考：基于 ${term} 上下文回答` },
      }),
    });
  });

  await page.goto('/');
  const fixture = path.resolve(process.cwd(), 'tests/e2e/fixtures/test-image.png');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/analysis/);

  await page.goto('/wordbank');
  await expect(page.getByText('术语解释已缓存，可直接切换浏览。')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '电影感 风格', exact: true }).click();
  await page.getByPlaceholder('继续追问这个术语（例如：在电商主图里怎么用？）').fill('怎么在海报里用？');
  await page.getByRole('button', { name: '发送追问' }).click();

  await expect(page.getByText('围绕 电影感 的追问回复：怎么在海报里用？')).toBeVisible();

  await page.getByRole('button', { name: '雨夜街道 环境', exact: true }).click();
  await expect(page.getByText('暂无追问记录，试着发起你的第一个问题。')).toBeVisible();

  await page.getByRole('button', { name: '电影感 风格', exact: true }).click();
  await expect(page.getByText('围绕 电影感 的追问回复：怎么在海报里用？')).toBeVisible();

  await page.getByRole('button', { name: '清空当前术语对话' }).click();
  await expect(page.getByText('暂无追问记录，试着发起你的第一个问题。')).toBeVisible();
});
