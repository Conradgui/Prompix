import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendTermFollowupMessages,
  buildTermFollowupKey,
  clearTermFollowupThread,
  getTermFollowupThread,
  loadTermFollowupCache,
  saveTermFollowupCache,
} from '../../lib/utils/termFollowupCache';

describe('term followup cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds stable thread key', () => {
    expect(buildTermFollowupKey('  Negative Space ', 'Chinese')).toBe('chinese::negative space');
  });

  it('appends and persists per-term thread', () => {
    const cache = appendTermFollowupMessages({}, 'Negative Space', 'Chinese', [
      { id: '1', role: 'user', text: '是什么？', timestamp: 1 },
      { id: '2', role: 'model', text: '是留白。', timestamp: 2 },
    ]);

    saveTermFollowupCache(cache);
    const loaded = loadTermFollowupCache();
    const thread = getTermFollowupThread(loaded, 'Negative Space', 'Chinese');

    expect(thread?.messages).toHaveLength(2);
    expect(thread?.messages[1].text).toBe('是留白。');
  });

  it('clears only current term thread', () => {
    let cache = appendTermFollowupMessages({}, 'A', 'Chinese', [
      { id: '1', role: 'user', text: 'a', timestamp: 1 },
    ]);
    cache = appendTermFollowupMessages(cache, 'B', 'Chinese', [
      { id: '2', role: 'user', text: 'b', timestamp: 2 },
    ]);

    const next = clearTermFollowupThread(cache, 'A', 'Chinese');

    expect(getTermFollowupThread(next, 'A', 'Chinese')).toBeNull();
    expect(getTermFollowupThread(next, 'B', 'Chinese')?.messages).toHaveLength(1);
  });
});
