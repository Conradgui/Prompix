import { getRuntimePolicy } from '../runtime/policy';
import { RuntimeMode } from '../types';

export const resolveRequestRuntimeMode = (raw: unknown): RuntimeMode => {
  return raw === 'api' ? 'api' : 'demo';
};

export const canUseCustomApiInRequest = (mode: RuntimeMode): boolean => {
  if (mode !== 'api') return false;
  return getRuntimePolicy() !== 'public-demo';
};

export const getApiModeBlockedMessage = (): string => {
  return '线上演示版仅开放平台直连模式，自定义 Key 仅在本地版可用。';
};
