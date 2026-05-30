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

  it('bypasses cache and returns static preset explanation for known terms', () => {
    const cached = getCachedTermExplanation({}, 'Memphis Style', 'English');
    expect(cached).not.toBeNull();
    expect(cached?.term).toBe('Memphis Style');
    expect(cached?.def).toContain('bold, vibrant colors');

    const cachedZh = getCachedTermExplanation({}, '孟菲斯风格', 'Chinese');
    expect(cachedZh).not.toBeNull();
    expect(cachedZh?.term).toBe('孟菲斯风格');
    expect(cachedZh?.def).toContain('鲜艳的色彩');
  });
});

