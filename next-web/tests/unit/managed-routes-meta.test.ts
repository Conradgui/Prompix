import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, limit: 100 })),
}));

vi.mock('@/lib/server/runtime-policy', () => ({
  resolveRequestRuntimeMode: vi.fn(() => 'demo'),
  canUseCustomApiInRequest: vi.fn(() => true),
  getApiModeBlockedMessage: vi.fn(() => 'blocked'),
}));

vi.mock('@/lib/server/managed-ops', () => ({
  analyzeWithMiniMax: vi.fn(async () => ({
    analysis: {
      description: 'ok',
      structuredPrompts: {
        subject: { original: '', translated: '' },
        environment: { original: '', translated: '' },
        composition: { original: '', translated: '' },
        lighting: { original: '', translated: '' },
        mood: { original: '', translated: '' },
        style: { original: '', translated: '' },
      },
    },
    meta: { thinking: 'analyze-thinking' },
  })),
  chatWithMiniMax: vi.fn(async () => ({
    text: 'chat-final',
    meta: { thinking: 'chat-thinking' },
  })),
  getServerProvider: vi.fn(() => null),
}));

import { POST as analyzePost } from '@/app/api/managed/analyze/route';
import { POST as chatPost } from '@/app/api/managed/chat/route';

describe('managed route meta pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns meta.thinking for analyze route', async () => {
    const req = new Request('http://localhost/api/managed/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/png;base64,abc', settings: { systemLanguage: 'Chinese' } }),
    }) as any;

    const res = await analyzePost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.meta?.thinking).toBe('analyze-thinking');
  });

  it('returns meta.thinking for chat route', async () => {
    const req = new Request('http://localhost/api/managed/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: [], message: '你好', settings: { systemLanguage: 'Chinese' } }),
    }) as any;

    const res = await chatPost(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toBe('chat-final');
  });
});
