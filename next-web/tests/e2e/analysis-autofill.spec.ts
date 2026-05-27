import path from 'node:path';
import { expect, test } from '@playwright/test';

const PARTIAL_ANALYSIS = {
  description: 'partial',
  structuredPrompts: {
    subject: { original: 'A blonde anime character close-up.', translated: '' },
    environment: { original: '', translated: '' },
    composition: { original: 'close-up, centered framing, negative space right', translated: '' },
    lighting: { original: 'soft diffuse light, high-key', translated: '' },
    mood: { original: 'calm, clean, premium', translated: '' },
    style: { original: 'anime-inspired, cinematic concept art', translated: '' },
  },
};

test('analysis auto-fills missing dimensions without manual refresh', async ({ page }) => {
  let regenerateCount = 0;

  await page.route('**/api/managed/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        analysis: PARTIAL_ANALYSIS,
        meta: { thinking: 'mock analyze thinking' },
      }),
    });
  });

  await page.route('**/api/managed/regenerate', async (route) => {
    regenerateCount += 1;
    const body = route.request().postDataJSON() as any;
    const dimension = body?.dimension || 'environment';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        segment: {
          original: dimension === 'environment'
            ? 'Modern minimalist bathroom with glass shower and tiled walls.'
            : `generated-${dimension}`,
          translated: '',
        },
        meta: { thinking: 'mock regenerate thinking' },
      }),
    });
  });

  await page.goto('/');
  const fileInput = page.locator('input[type="file"]');
  const fixture = path.resolve(process.cwd(), 'tests/e2e/fixtures/test-image.png');
  await fileInput.setInputFiles(fixture);

  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByText('分析结果')).toBeVisible();

  await expect(page.getByText('Modern minimalist bathroom with glass shower and tiled walls.')).toBeVisible();
  expect(regenerateCount).toBeGreaterThan(0);

  await page.getByText('查看模型思考').first().click();
  const thinkingPreClass = await page.locator('pre').first().getAttribute('class');
  expect(thinkingPreClass || '').toContain('max-h-56');
  expect(thinkingPreClass || '').toContain('overflow-y-auto');
});

