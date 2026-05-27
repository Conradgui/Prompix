import { NextRequest, NextResponse } from 'next/server';
import { getRuntimePolicy } from '../runtime/policy';
import { DeveloperModeState } from '../types';

const DEV_MODE_COOKIE = 'prompix_dev_mode_session';
const DEV_MODE_TTL_SECONDS = 60 * 60 * 12;

const getSource = (): DeveloperModeState['source'] => {
  return getRuntimePolicy() === 'local' ? 'local' : 'public';
};

const parseExpiry = (value: string | undefined): number | null => {
  if (!value) return null;
  const expirySec = Number(value);
  if (!Number.isFinite(expirySec)) return null;
  return expirySec * 1000;
};

const readExpiryFromRequest = (req: NextRequest): number | null => {
  const value = req.cookies.get(DEV_MODE_COOKIE)?.value;
  return parseExpiry(value);
};

export const readDeveloperModeState = (req: NextRequest): DeveloperModeState => {
  const source = getSource();
  if (source === 'local') {
    return {
      authorized: true,
      source,
      expiresAt: null,
    };
  }

  const expiresAt = readExpiryFromRequest(req);
  const now = Date.now();
  return {
    authorized: Boolean(expiresAt && expiresAt > now),
    source,
    expiresAt,
  };
};

export const isDeveloperModePasswordConfigured = (): boolean => {
  return Boolean((process.env.PROMPIX_DEV_MODE_PASSWORD || '').trim());
};

export const verifyDeveloperPassword = (password: string): boolean => {
  const expected = (process.env.PROMPIX_DEV_MODE_PASSWORD || '').trim();
  if (!expected) return false;
  return password.trim() === expected;
};

export const attachDeveloperSessionCookie = (response: NextResponse): NextResponse => {
  const expiresAtSec = Math.floor(Date.now() / 1000) + DEV_MODE_TTL_SECONDS;
  response.cookies.set({
    name: DEV_MODE_COOKIE,
    value: String(expiresAtSec),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DEV_MODE_TTL_SECONDS,
    path: '/',
  });
  return response;
};

export const clearDeveloperSessionCookie = (response: NextResponse): NextResponse => {
  response.cookies.set({
    name: DEV_MODE_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  return response;
};
