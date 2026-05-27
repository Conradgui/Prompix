import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canUseApiMode, enforceRuntimeModePolicy, getRuntimePolicy, isManagedEnabled } from '../../lib/runtime/policy';

const ORIGINAL_POLICY = process.env.NEXT_PUBLIC_RUNTIME_POLICY;

describe('runtime policy', () => {
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

  it('defaults to local policy', () => {
    expect(getRuntimePolicy()).toBe('local');
    expect(canUseApiMode()).toBe(true);
  });

  it('resolves public-demo policy from env but canUseApiMode is always true', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-demo';
    expect(getRuntimePolicy()).toBe('public-demo');
    expect(canUseApiMode()).toBe(true);
    expect(isManagedEnabled()).toBe(true);
  });

  it('resolves public-live policy from env', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-live';
    expect(getRuntimePolicy()).toBe('public-live');
    expect(canUseApiMode()).toBe(true);
    expect(isManagedEnabled()).toBe(true);
  });

  it('always enforces api mode', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-demo';
    expect(enforceRuntimeModePolicy('api')).toBe('api');
    expect(enforceRuntimeModePolicy('demo')).toBe('api');
  });
});
