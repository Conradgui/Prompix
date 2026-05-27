import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canUseCustomApiInRequest,
  resolveRequestRuntimeMode,
} from '../../lib/server/runtime-policy';

const ORIGINAL_POLICY = process.env.NEXT_PUBLIC_RUNTIME_POLICY;

describe('server runtime policy guard', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RUNTIME_POLICY;
  });

  afterEach(() => {
    if (typeof ORIGINAL_POLICY === 'string') {
      process.env.NEXT_PUBLIC_RUNTIME_POLICY = ORIGINAL_POLICY;
      return;
    }
    delete process.env.NEXT_PUBLIC_RUNTIME_POLICY;
  });

  it('normalizes request mode', () => {
    expect(resolveRequestRuntimeMode('api')).toBe('api');
    expect(resolveRequestRuntimeMode('demo')).toBe('demo');
    expect(resolveRequestRuntimeMode('anything-else')).toBe('demo');
  });

  it('blocks custom api in public-demo', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-demo';
    expect(canUseCustomApiInRequest('api')).toBe(false);
    expect(canUseCustomApiInRequest('demo')).toBe(false);
  });

  it('allows custom api in local/public-live', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'local';
    expect(canUseCustomApiInRequest('api')).toBe(true);

    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-live';
    expect(canUseCustomApiInRequest('api')).toBe(true);
  });
});
