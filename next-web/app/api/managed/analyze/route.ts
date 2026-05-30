import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { analyzeWithProvider } from '@/lib/server/managed-ops';
import { canUseCustomApiInRequest, getApiModeBlockedMessage, resolveRequestRuntimeMode } from '@/lib/server/runtime-policy';

export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimit(req, 'analysis');
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '今日分析额度已用完，请明天再试。', limit: limit.limit, remaining: limit.remaining },
        { status: 429 },
      );
    }

    const body = await req.json();
    const image = typeof body?.image === 'string' ? body.image : '';
    const settings = body?.settings;
    const mode = resolveRequestRuntimeMode(body?.mode);
    if (mode === 'api' && !canUseCustomApiInRequest(mode)) {
      return NextResponse.json({ error: getApiModeBlockedMessage() }, { status: 403 });
    }

    const apiConfig = canUseCustomApiInRequest(mode) ? body?.apiConfig : undefined;

    if (!image || !settings) {
      return NextResponse.json({ error: '缺少图片或设置参数。' }, { status: 400 });
    }

    const result = await analyzeWithProvider(image, settings, apiConfig);
    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || '分析失败，请稍后重试。';
    const status = message === 'MANAGED_PROVIDER_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
