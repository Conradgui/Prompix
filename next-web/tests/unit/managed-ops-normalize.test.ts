import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../lib/types';

vi.mock('../../lib/server/minimax', () => ({
  buildVisionPrompt: vi.fn((_image: string, prompt: string) => prompt),
  callMiniMax: vi.fn(),
  resolveMiniMaxConfig: vi.fn(() => ({
    source: 'managed',
    apiKey: 'sk-managed',
    groupId: 'group-1',
    model: 'MiniMax-M2.5',
    baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
  })),
}));

import { callMiniMax } from '../../lib/server/minimax';
import { analyzeWithMiniMax } from '../../lib/server/managed-ops';

describe('managed analysis normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes non-standard segment shapes into six dimensions', async () => {
    vi.mocked(callMiniMax).mockResolvedValueOnce(JSON.stringify({
      summary: '浴室场景',
      subject: '玻璃淋浴间与人物特写',
      environment: { text: '现代极简浴室，墙面浅灰瓷砖' },
      composition: { tags: ['close-up', 'rule of thirds', 'negative space'] },
      lighting: ['soft diffuse light', 'high-key'],
      mood: { value: 'clean, calm, premium' },
      style: { original: 'anime-inspired, cinematic' },
    }));

    const result = await analyzeWithMiniMax('img-data', DEFAULT_SETTINGS);

    expect(result.analysis.description).toBe('浴室场景');
    expect(result.analysis.structuredPrompts.subject.original).toContain('玻璃淋浴间');
    expect(result.analysis.structuredPrompts.environment.original).toContain('现代极简浴室');
    expect(result.analysis.structuredPrompts.composition.original).toContain('negative space');
    expect(result.analysis.structuredPrompts.lighting.original).toContain('soft diffuse light');
    expect(result.analysis.structuredPrompts.mood.original).toContain('clean');
    expect(result.analysis.structuredPrompts.style.original).toContain('cinematic');
  });

  it('extracts dimensions from description blocks when structuredPrompts is missing', async () => {
    vi.mocked(callMiniMax).mockResolvedValueOnce(`
Subject: Blonde anime character close-up with blue eyes.
Environment: Minimalist indoor shower space with glass and tiles.
Composition: close-up, centered framing, negative space right.
Lighting: soft diffuse light, high-key.
Mood: calm, clean, premium.
Style: anime-inspired, cinematic concept art.
`.trim());

    const result = await analyzeWithMiniMax('img-data', DEFAULT_SETTINGS);

    expect(result.analysis.structuredPrompts.subject.original).toContain('Blonde anime character');
    expect(result.analysis.structuredPrompts.environment.original).toContain('indoor shower');
    expect(result.analysis.structuredPrompts.composition.original).toContain('negative space');
    expect(result.analysis.structuredPrompts.lighting.original).toContain('high-key');
    expect(result.analysis.structuredPrompts.mood.original).toContain('calm');
    expect(result.analysis.structuredPrompts.style.original).toContain('anime-inspired');
  });
});

