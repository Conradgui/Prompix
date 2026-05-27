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
import { analyzeWithMiniMax, chatWithMiniMax, termFollowupWithMiniMax } from '../../lib/server/managed-ops';

const buildAnalysisJson = () => JSON.stringify({
  description: '测试描述',
  structuredPrompts: {
    subject: { original: 's1', translated: 's2' },
    environment: { original: 'e1', translated: 'e2' },
    composition: { original: 'c1', translated: 'c2' },
    lighting: { original: 'l1', translated: 'l2' },
    mood: { original: 'm1', translated: 'm2' },
    style: { original: 'st1', translated: 'st2' },
  },
});

describe('managed ops meta.thinking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns analysis with thinking meta', async () => {
    vi.mocked(callMiniMax).mockResolvedValueOnce(`<think>内部分析过程</think>\n\n${buildAnalysisJson()}`);

    const result = await analyzeWithMiniMax('img-data', DEFAULT_SETTINGS);

    expect(result.analysis.description).toBe('测试描述');
    expect(result.meta?.thinking).toBe('内部分析过程');
  });

  it('returns chat text without think tags and keeps thinking meta', async () => {
    vi.mocked(callMiniMax).mockResolvedValueOnce('<thinking>chat-think</thinking>\n\n你好，我是助手');

    const result = await chatWithMiniMax({
      history: [],
      message: '你好',
      settings: DEFAULT_SETTINGS,
    });

    expect(result.text).toBe('你好，我是助手');
    expect(result.meta?.thinking).toBe('chat-think');
  });

  it('returns term follow-up text and thinking meta', async () => {
    vi.mocked(callMiniMax).mockResolvedValueOnce('<thinking>followup-think</thinking>\n\n建议先从构图留白比例开始。');

    const result = await termFollowupWithMiniMax({
      term: 'negative space',
      language: 'Chinese',
      definition: '通过留白强化主体',
      application: '用于海报与封面',
      history: [],
      message: '先做哪一步？',
    });

    expect(result.text).toBe('建议先从构图留白比例开始。');
    expect(result.meta?.thinking).toBe('followup-think');
  });
});
