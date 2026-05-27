import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTermCacheKey,
  getCachedTermExplanation,
  isValidTermExplanation,
  loadTermExplanationCache,
  saveTermExplanationCache,
  upsertTermExplanationCache,
} from '../../lib/utils/termExplanationCache';

describe('term explanation cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds stable cache key', () => {
    expect(buildTermCacheKey('  Surrealism ', 'Chinese')).toBe('chinese::surrealism');
  });

  it('saves and loads cache from localStorage', () => {
    const updated = upsertTermExplanationCache({}, 'Surrealism', 'Chinese', {
      def: '定义',
      app: '应用',
    });
    saveTermExplanationCache(updated);

    const loaded = loadTermExplanationCache();
    const cached = getCachedTermExplanation(loaded, 'Surrealism', 'Chinese');
    expect(cached?.def).toBe('定义');
    expect(cached?.app).toBe('应用');
  });

  it('validates explanation completeness', () => {
    expect(isValidTermExplanation({ def: 'x', app: 'y' })).toBe(true);
    expect(isValidTermExplanation({ def: 'x', app: '' })).toBe(false);
    expect(isValidTermExplanation({ def: '', app: 'y' })).toBe(false);
  });
});

