import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

type RateBucket = 'analysis' | 'chat';

const LIMITS: Record<RateBucket, number> = {
  analysis: 30,
  chat: 120,
};

const getUpstashConfig = () => {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return { enabled: Boolean(url && token), url, token };
};

const getClientFingerprint = (req: NextRequest): string => {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || 'unknown-ip';
  const ua = (req.headers.get('user-agent') || 'unknown-ua').slice(0, 180);
  return createHash('sha1').update(`${ip}|${ua}`).digest('hex');
};

const getTodayKeyPart = (): string => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const secondsUntilDayEndUTC = (): number => {
  const now = new Date();
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(60, Math.floor((end - now.getTime()) / 1000));
};

const upstashRequest = async (url: string, token: string): Promise<number | null> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const result = Number(data?.result);
  return Number.isFinite(result) ? result : null;
};

export const checkRateLimit = async (
  req: NextRequest,
  bucket: RateBucket,
): Promise<{ allowed: boolean; remaining: number; limit: number }> => {
  const limit = LIMITS[bucket];
  const cfg = getUpstashConfig();
  if (!cfg.enabled) {
    return { allowed: true, remaining: limit, limit };
  }

  try {
    const fingerprint = getClientFingerprint(req);
    const date = getTodayKeyPart();
    const key = `prompix:rl:${bucket}:${date}:${fingerprint}`;
    const keyEncoded = encodeURIComponent(key);
    const count = await upstashRequest(`${cfg.url}/incr/${keyEncoded}`, cfg.token);
    if (count === null) {
      return { allowed: true, remaining: limit, limit };
    }
    if (count === 1) {
      const ttl = secondsUntilDayEndUTC();
      await upstashRequest(`${cfg.url}/expire/${keyEncoded}/${ttl}`, cfg.token);
    }

    const remaining = Math.max(0, limit - count);
    return {
      allowed: count <= limit,
      remaining,
      limit,
    };
  } catch {
    return { allowed: true, remaining: limit, limit };
  }
};
