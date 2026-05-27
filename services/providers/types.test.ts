import {
  DEFAULT_API_CONFIG,
  getApiConfig,
  getRuntimeMode,
  isApiConfigReady,
  setApiConfig,
  setRuntimeMode,
  STORAGE_KEYS,
} from './types';

describe('provider runtime and api config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to demo mode', () => {
    expect(getRuntimeMode()).toBe('demo');
  });

  it('can persist runtime mode', () => {
    setRuntimeMode('api');
    expect(getRuntimeMode()).toBe('api');
    expect(localStorage.getItem(STORAGE_KEYS.RUNTIME_MODE)).toBe('api');
  });

  it('normalizes api config and persists to localStorage', () => {
    const next = setApiConfig({
      providerLabel: 'OpenAI Compatible',
      baseUrl: 'api.openai.com/v1/',
      model: 'gpt-4o-mini',
      apiKey: 'sk-demo-key',
    });

    expect(next.baseUrl).toBe('https://api.openai.com/v1');
    expect(next.providerLabel).toBe('OpenAI Compatible');

    const stored = getApiConfig();
    expect(stored.model).toBe('gpt-4o-mini');
    expect(stored.apiKey).toBe('sk-demo-key');
  });

  it('validates config readiness', () => {
    expect(isApiConfigReady(DEFAULT_API_CONFIG)).toBe(false);
    expect(isApiConfigReady({ ...DEFAULT_API_CONFIG, apiKey: 'sk-ready' })).toBe(true);
  });
});
