import path from 'node:path';
import { expect, test } from '@playwright/test';

const MOCK_ANALYSIS_EN = {
  description: 'Futuristic city night poster',
  structuredPrompts: {
    subject: { original: 'Young woman on a rooftop, silver short hair, black trench coat', translated: '' },
    environment: { original: 'Cyberpunk city with neon lights and wet reflective streets', translated: '' },
    composition: { original: 'Medium shot, rule-of-thirds, low-angle composition', translated: '' },
    lighting: { original: 'Cool key light, rim light, volumetric fog', translated: '' },
    mood: { original: 'Restrained, lonely, futuristic mood', translated: '' },
    style: { original: 'Cinematic concept art, hyper-realistic style', translated: '' },
  },
};

const MOCK_ANALYSIS_ZH = {
  description: '未来城市夜景海报',
  structuredPrompts: {
    subject: { original: '站在天台的年轻女性，银白短发，黑色风衣', translated: '' },
    environment: { original: '赛博朋克城市，霓虹灯，雨后街道反光', translated: '' },
    composition: { original: '中景，三分法构图，低机位仰拍', translated: '' },
    lighting: { original: '冷色主光，边缘轮廓光，体积雾', translated: '' },
    mood: { original: '克制、孤独、未来感', translated: '' },
    style: { original: '电影级概念设计，超写实', translated: '' },
  },
};

test('core flow routes and upload to analysis', async ({ page }) => {
  let analyzeCallCount = 0;

  await page.route('**/api/managed/analyze', async (route) => {
    analyzeCallCount += 1;
    const request = route.request();
    const body = request.postDataJSON() as any;
    const lang = body?.settings?.promptOutputLanguage;
    const payload = lang === 'zh' ? MOCK_ANALYSIS_ZH : MOCK_ANALYSIS_EN;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        analysis: payload,
        meta: { thinking: '这是分析思考文本' },
      }),
    });
  });

  await page.route('**/api/managed/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: '这是测试环境返回的对话结果。',
        meta: { thinking: '这是聊天思考文本' },
      }),
    });
  });

  await page.route('**/api/managed/explain-term', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        explanation: {
          def: '术语定义测试内容',
          app: '术语应用测试内容',
        },
        meta: { thinking: '这是术语解释思考文本' },
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('从视觉到提示词')).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const fixture = path.resolve(process.cwd(), 'tests/e2e/fixtures/test-image.png');
  await fileInput.setInputFiles(fixture);

  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByText('分析结果')).toBeVisible();
  await expect(page.getByText('Young woman on a rooftop, silver short hair, black trench coat')).toBeVisible();
  expect(analyzeCallCount).toBe(1);
  await page.getByText('查看模型思考').first().click();
  await expect(page.getByText('这是分析思考文本')).toBeVisible();

  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByText('站在天台的年轻女性，银白短发，黑色风衣')).toBeVisible();
  expect(analyzeCallCount).toBe(2);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('Young woman on a rooftop, silver short hair, black trench coat')).toBeVisible();
  expect(analyzeCallCount).toBe(2);

  await page.getByPlaceholder(/继续提问|Ask follow-up/i).fill('请给我更电影化的版本');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('这是测试环境返回的对话结果。')).toBeVisible();
  await page.locator('summary').filter({ hasText: '查看模型思考' }).last().click();
  await expect(page.getByText('这是聊天思考文本')).toBeVisible();
  await expect(page.getByText('<think>')).toHaveCount(0);

  await page.goto('/library');
  await expect(page.getByText('提示词历史库')).toBeVisible();

  await page.goto('/wordbank');
  const hasTermList = await page.getByText('术语列表').isVisible().catch(() => false);
  if (!hasTermList) {
    await expect(page.getByText('先完成至少一次图片分析，才能生成术语库。')).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '主体', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '环境', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '构图', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '光照', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '情绪', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '风格', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新解释' })).toHaveCount(0);
    await page.getByText('查看模型思考').first().click();
    await expect(page.getByText('这是术语解释思考文本')).toBeVisible();
  }

  await page.goto('/settings');
  await expect(page.getByText('运行模式')).toBeVisible();
});
