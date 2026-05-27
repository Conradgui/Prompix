import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_API_CONFIG,
  getApiConfig,
  isApiConfigReady,
  setApiConfig,
  STORAGE_KEYS,
} from '../../lib/services/providers';

describe('provider config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes minimax api config and persists groupId', () => {
    const next = setApiConfig({
      providerLabel: 'MiniMax',
      baseUrl: 'api.minimaxi.com/v1/chat/completions/',
      model: 'MiniMax-M2.5',
      apiKey: ' sk-custom-key ',
      groupId: ' group-a ',
    });

    expect(next.baseUrl).toBe('https://api.minimaxi.com/v1/chat/completions');
    expect(next.apiKey).toBe('sk-custom-key');
    expect(next.groupId).toBe('group-a');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.API_CONFIG) || '{}');
    expect(saved.groupId).toBe('group-a');
  });

  it('does not require groupId for api mode readiness', () => {
    expect(isApiConfigReady(DEFAULT_API_CONFIG)).toBe(false);

    expect(
      isApiConfigReady({
        ...DEFAULT_API_CONFIG,
        apiKey: 'sk-ready',
        groupId: '',
      }),
    ).toBe(true);
  });

  it('reads legacy config and migrates shape', () => {
    localStorage.setItem(
      'SNAPLEX_API_CONFIG',
      JSON.stringify({
        providerLabel: 'Legacy',
        baseUrl: 'api.minimaxi.com/v1/chat/completions',
        model: 'MiniMax-M2.5',
        apiKey: 'sk-legacy',
        groupId: 'legacy-group',
      }),
    );

    const next = getApiConfig();
    expect(next.baseUrl).toBe('https://api.minimaxi.com/v1/chat/completions');
    expect(next.apiKey).toBe('sk-legacy');
    expect(next.groupId).toBe('legacy-group');
  });
});
