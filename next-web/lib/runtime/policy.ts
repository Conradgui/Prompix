import { RuntimeMode } from '../types';

export type RuntimePolicy = 'local' | 'public-live' | 'public-demo';

export const getRuntimePolicy = (): RuntimePolicy => {
  const value = (process.env.NEXT_PUBLIC_RUNTIME_POLICY || '').trim().toLowerCase();
  if (value === 'public-demo') return 'public-demo';
  if (value === 'public-live') return 'public-live';
  return 'local';
};

export const isPublicDemoPolicy = (): boolean => {
  return getRuntimePolicy() === 'public-demo';
};

export const enforceRuntimeModePolicy = (mode: RuntimeMode): RuntimeMode => {
  return 'api';
};

export const canUseApiMode = (): boolean => {
  return true;
};

export const isManagedEnabled = (): boolean => {
  const policy = getRuntimePolicy();
  return policy === 'public-live' || policy === 'public-demo' || policy === 'local';
};
