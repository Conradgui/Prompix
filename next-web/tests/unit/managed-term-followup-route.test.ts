import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, limit: 120 })),
}));

vi.mock('@/lib/server/runtime-policy', () => ({
  resolveRequestRuntimeMode: vi.fn(() => 'demo'),
  canUseCustomApiInRequest: vi.fn(() => true),
  getApiModeBlockedMessage: vi.fn(() => 'blocked'),
}));

vi.mock('@/lib/server/managed-ops', () => ({
  termFollowupWithProvider: vi.fn(async () => ({
    text: 'follow-up answer',
    meta: { thinking: 'follow-up thinking' },
  })),
}));

import { POST as termFollowupPost } from '@/app/api/managed/term-followup/route';

describe('managed term followup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns follow-up response with meta.thinking', async () => {
    const req = new Request('http://localhost/api/managed/term-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: 'negative space',
        language: 'Chinese',
        definition: 'def',
        application: 'app',
        history: [],
        message: '怎么用？',
      }),
    }) as any;

    const res = await termFollowupPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.text).toBe('follow-up answer');
    expect(data.meta?.thinking).toBe('follow-up thinking');
  });

  it('returns 400 when message is empty', async () => {
    const req = new Request('http://localhost/api/managed/term-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: 'negative space',
        language: 'Chinese',
        definition: 'def',
        application: 'app',
        history: [],
        message: '   ',
      }),
    }) as any;

    const res = await termFollowupPost(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(String(data.error || '')).toContain('追问内容不能为空');
  });
});
