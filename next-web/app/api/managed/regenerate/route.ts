import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { regenerateWithMiniMax } from '@/lib/server/managed-ops';
import { canUseCustomApiInRequest, getApiModeBlockedMessage, resolveRequestRuntimeMode } from '@/lib/server/runtime-policy';

const ALLOWED_DIMENSIONS = new Set(['subject', 'environment', 'composition', 'lighting', 'mood', 'style']);

export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimit(req, 'analysis');
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '今日刷新额度已用完，请明天再试。', limit: limit.limit, remaining: limit.remaining },
        { status: 429 },
      );
    }

    const body = await req.json();
    const image = typeof body?.image === 'string' ? body.image : '';
    const settings = body?.settings;
    const dimension = typeof body?.dimension === 'string' ? body.dimension : '';
    const mode = resolveRequestRuntimeMode(body?.mode);
    if (mode === 'api' && !canUseCustomApiInRequest(mode)) {
      return NextResponse.json({ error: getApiModeBlockedMessage() }, { status: 403 });
    }

    const apiConfig = canUseCustomApiInRequest(mode) ? body?.apiConfig : undefined;

    if (!image || !settings || !ALLOWED_DIMENSIONS.has(dimension)) {
      return NextResponse.json({ error: '缺少必要参数或维度无效。' }, { status: 400 });
    }

    const result = await regenerateWithMiniMax(image, dimension as any, settings, apiConfig);
    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || '刷新失败，请稍后重试。';
    const status = message === 'MANAGED_PROVIDER_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
