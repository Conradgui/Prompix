import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../lib/types';
import { applyPromptOutputLanguage } from '../../lib/utils/promptOutput';
import { STORAGE_KEYS, getRuntimeMode, setRuntimeMode } from '../../lib/services/providers';

const ORIGINAL_POLICY = process.env.NEXT_PUBLIC_RUNTIME_POLICY;

describe('runtime mode + prompt language', () => {
  beforeEach(() => {
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_RUNTIME_POLICY;
  });

  afterEach(() => {
    if (typeof ORIGINAL_POLICY === 'string') {
      process.env.NEXT_PUBLIC_RUNTIME_POLICY = ORIGINAL_POLICY;
      return;
    }
    delete process.env.NEXT_PUBLIC_RUNTIME_POLICY;
  });

  it('persists runtime mode in local policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'local';
    const next = setRuntimeMode('api');
    expect(next).toBe('api');
    expect(getRuntimeMode()).toBe('api');
  });

  it('allows api mode in public-live policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-live';
    const next = setRuntimeMode('api');
    expect(next).toBe('api');
    expect(getRuntimeMode()).toBe('api');
  });

  it('always enforces api mode in public-demo policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-demo';
    localStorage.setItem(STORAGE_KEYS.RUNTIME_MODE, 'api');
    expect(getRuntimeMode()).toBe('api');
  });

  it('allows api mode set when in public-demo policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-demo';
    const next = setRuntimeMode('api');
    expect(next).toBe('api');
    expect(localStorage.getItem(STORAGE_KEYS.RUNTIME_MODE)).toBe('api');
  });

  it('maps zh prompt output correctly', () => {
    const next = applyPromptOutputLanguage(DEFAULT_SETTINGS, 'zh');
    expect(next.cardFrontLanguage).toBe('Chinese');
    expect(next.cardBackLanguage).toBe('English');
  });

  it('maps en prompt output correctly', () => {
    const next = applyPromptOutputLanguage(DEFAULT_SETTINGS, 'en');
    expect(next.cardFrontLanguage).toBe('English');
    expect(next.cardBackLanguage).toBe('Chinese');
  });

  it('uses english as default prompt output for new settings', () => {
    expect(DEFAULT_SETTINGS.promptOutputLanguage).toBe('en');
    expect(DEFAULT_SETTINGS.cardFrontLanguage).toBe('English');
  });
});
