import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { explainTermWithMiniMax } from '../../lib/server/managed-ops';

describe('managed explain term', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries once when first response is missing fields', async () => {
    vi.mocked(callMiniMax)
      .mockResolvedValueOnce('<think>We need to parse user request</think>\n\n{"def":"","app":""}')
      .mockResolvedValueOnce('<think>先提炼关键语义</think>\n\n{"def":"超现实主义定义","app":"用于梦境化视觉表达"}');

    const result = await explainTermWithMiniMax('Surrealism', 'Chinese');

    expect(result.explanation.def).toBe('超现实主义定义');
    expect(result.explanation.app).toBe('用于梦境化视觉表达');
    expect(vi.mocked(callMiniMax)).toHaveBeenCalledTimes(2);
    expect(result.meta?.thinking).toContain('先提炼关键语义');
    expect(result.meta?.thinking || '').not.toContain('We need to parse');
  });

  it('throws readable error when both attempts fail', async () => {
    vi.mocked(callMiniMax)
      .mockResolvedValueOnce('{"def":"","app":""}')
      .mockResolvedValueOnce('not-json');

    await expect(explainTermWithMiniMax('Surrealism', 'Chinese')).rejects.toThrow('术语解释暂时不可用');
    expect(vi.mocked(callMiniMax)).toHaveBeenCalledTimes(2);
  });
});

