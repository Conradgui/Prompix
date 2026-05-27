import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isDeveloperModePasswordConfigured,
  readDeveloperModeState,
  verifyDeveloperPassword,
} from '../../lib/server/developer-mode';

describe('developer mode session', () => {
  it('is always authorized in local policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'local';
    const req = new NextRequest('http://localhost:4300');
    const state = readDeveloperModeState(req);
    expect(state.authorized).toBe(true);
    expect(state.source).toBe('local');
  });

  it('requires valid cookie in public policy', () => {
    process.env.NEXT_PUBLIC_RUNTIME_POLICY = 'public-live';
    const future = Math.floor(Date.now() / 1000) + 3600;
    const req = new NextRequest('http://localhost:4300', {
      headers: {
        cookie: `prompix_dev_mode_session=${future}`,
      },
    });
    const state = readDeveloperModeState(req);
    expect(state.source).toBe('public');
    expect(state.authorized).toBe(true);
  });

  it('validates developer password with env var', () => {
    process.env.PROMPIX_DEV_MODE_PASSWORD = 'abc123';
    expect(isDeveloperModePasswordConfigured()).toBe(true);
    expect(verifyDeveloperPassword('abc123')).toBe(true);
    expect(verifyDeveloperPassword('wrong')).toBe(false);
  });
});
