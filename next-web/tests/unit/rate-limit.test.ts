import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '../../lib/server/rate-limit';

const ORIGINAL_ENV = {
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

const fakeReq = (ip = '1.1.1.1', ua = 'vitest-agent') => {
  return {
    headers: new Headers({
      'x-forwarded-for': ip,
      'user-agent': ua,
    }),
  } as any;
};

const toJsonResponse = (payload: unknown): Response => {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

describe('rate limit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_ENV.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN;
    vi.restoreAllMocks();
  });

  it('fails open when Upstash is not configured', async () => {
    const result = await checkRateLimit(fakeReq(), 'analysis');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(30);
  });

  it('increments and sets ttl on first hit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token-demo';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(toJsonResponse({ result: 1 }))
      .mockResolvedValueOnce(toJsonResponse({ result: 1 }));

    const result = await checkRateLimit(fakeReq(), 'analysis');

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(29);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/incr/');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/expire/');
  });

  it('blocks when count exceeds chat limit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token-demo';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(toJsonResponse({ result: 121 }));

    const result = await checkRateLimit(fakeReq('2.2.2.2'), 'chat');
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(120);
    expect(result.remaining).toBe(0);
  });
});
