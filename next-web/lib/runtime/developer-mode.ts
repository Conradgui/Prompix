import { DeveloperModeState } from '../types';
import { getRuntimePolicy } from './policy';

const defaultState = (): DeveloperModeState => {
  if (getRuntimePolicy() === 'local') {
    return {
      authorized: true,
      source: 'local',
      expiresAt: null,
    };
  }

  return {
    authorized: false,
    source: 'public',
    expiresAt: null,
  };
};

const request = async (method: 'GET' | 'POST' | 'DELETE', body?: Record<string, unknown>) => {
  const response = await fetch('/api/dev-mode/session', {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || '开发者模式请求失败。');
  }

  return data;
};

export const fetchDeveloperModeState = async (): Promise<DeveloperModeState> => {
  try {
    const data = await request('GET');
    return {
      authorized: Boolean(data?.authorized),
      source: data?.source === 'local' ? 'local' : 'public',
      expiresAt: typeof data?.expiresAt === 'number' ? data.expiresAt : null,
    };
  } catch {
    return defaultState();
  }
};

export const enableDeveloperMode = async (password?: string): Promise<DeveloperModeState> => {
  const data = await request('POST', { password: password || '' });
  return {
    authorized: Boolean(data?.authorized),
    source: data?.source === 'local' ? 'local' : 'public',
    expiresAt: typeof data?.expiresAt === 'number' ? data.expiresAt : null,
  };
};

export const disableDeveloperMode = async (): Promise<void> => {
  await request('DELETE');
};

export const isLocalDeveloperModePolicy = (): boolean => {
  return getRuntimePolicy() === 'local';
};
