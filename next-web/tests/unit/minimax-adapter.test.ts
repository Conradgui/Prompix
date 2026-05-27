import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVisionPrompt, callMiniMax, resolveMiniMaxConfig } from '../../lib/server/minimax';

const ORIGINAL_ENV = {
  MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
  MINIMAX_GROUP_ID: process.env.MINIMAX_GROUP_ID,
  MINIMAX_MODEL: process.env.MINIMAX_MODEL,
  MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL,
};

const toJsonResponse = (payload: unknown, status = 200): Response => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

describe('MiniMax adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_GROUP_ID;
    delete process.env.MINIMAX_MODEL;
    delete process.env.MINIMAX_BASE_URL;
  });

  afterEach(() => {
    process.env.MINIMAX_API_KEY = ORIGINAL_ENV.MINIMAX_API_KEY;
    process.env.MINIMAX_GROUP_ID = ORIGINAL_ENV.MINIMAX_GROUP_ID;
    process.env.MINIMAX_MODEL = ORIGINAL_ENV.MINIMAX_MODEL;
    process.env.MINIMAX_BASE_URL = ORIGINAL_ENV.MINIMAX_BASE_URL;
    vi.restoreAllMocks();
  });

  it('wraps image input with MiniMax text-image format', () => {
    const result = buildVisionPrompt('data:image/png;base64,AAAABBBB', '分析图片');
    expect(result).toContain('分析图片');
    expect(result).toContain('[图片base64:AAAABBBB]');
  });

  it('prefers custom config when key and groupId are provided', () => {
    process.env.MINIMAX_API_KEY = 'sk-managed';
    process.env.MINIMAX_GROUP_ID = 'managed-group';

    const config = resolveMiniMaxConfig({
      apiKey: 'sk-custom',
      groupId: 'custom-group',
      model: 'MiniMax-M2.5',
      baseUrl: 'api.minimaxi.com/v1/chat/completions',
    });

    expect(config.source).toBe('custom');
    expect(config.apiKey).toBe('sk-custom');
    expect(config.groupId).toBe('custom-group');
    expect(config.baseUrl).toBe('https://api.minimaxi.com/v1/chat/completions');
  });

  it('uses managed env config when custom config is absent', () => {
    process.env.MINIMAX_API_KEY = 'sk-managed';
    process.env.MINIMAX_GROUP_ID = 'managed-group';
    process.env.MINIMAX_MODEL = 'MiniMax-M2.5';

    const config = resolveMiniMaxConfig();
    expect(config.source).toBe('managed');
    expect(config.apiKey).toBe('sk-managed');
    expect(config.groupId).toBe('managed-group');
    expect(config.model).toBe('MiniMax-M2.5');
  });

  it('throws when managed config is missing', () => {
    expect(() => resolveMiniMaxConfig()).toThrowError('MANAGED_PROVIDER_NOT_CONFIGURED');
  });

  it('builds request with GroupId and parses text response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      expect(url).toContain('GroupId=group-1');

      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.model).toBe('MiniMax-M2.5');
      expect(body.messages[0].content).toBe('hello');
      expect(body.max_tokens).toBe(256);

      return toJsonResponse({
        choices: [
          {
            message: {
              content: 'ok-from-minimax',
            },
          },
        ],
      });
    });

    const text = await callMiniMax(
      {
        source: 'custom',
        apiKey: 'sk-custom',
        groupId: 'group-1',
        baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
        model: 'MiniMax-M2.5',
      },
      [{ role: 'user', content: 'hello' }],
      { maxTokens: 256 },
    );

    expect(text).toBe('ok-from-minimax');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps auth and quota style errors to readable messages', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(toJsonResponse({ error: { message: 'invalid token' } }, 401))
      .mockResolvedValueOnce(toJsonResponse({ base_resp: { status_msg: 'insufficient balance' } }, 400));

    const config = {
      source: 'custom' as const,
      apiKey: 'sk-custom',
      groupId: 'group-1',
      baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
      model: 'MiniMax-M2.5',
    };

    await expect(callMiniMax(config, [{ role: 'user', content: 'a' }])).rejects.toThrow('鉴权失败');
    await expect(callMiniMax(config, [{ role: 'user', content: 'b' }])).rejects.toThrow('余额或额度不足');
  });

  it('maps business error even when HTTP status is 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      toJsonResponse({ base_resp: { status_code: 2049, status_msg: 'invalid api key' } }, 200),
    );

    await expect(
      callMiniMax(
        {
          source: 'custom',
          apiKey: 'sk-custom',
          groupId: 'group-1',
          baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
          model: 'MiniMax-M2.5',
        },
        [{ role: 'user', content: 'hello' }],
      ),
    ).rejects.toThrow('鉴权失败');
  });
});
