import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { translateWithMiniMax } from '@/lib/server/managed-ops';
import { canUseCustomApiInRequest, getApiModeBlockedMessage, resolveRequestRuntimeMode } from '@/lib/server/runtime-policy';

export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimit(req, 'chat');
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '今日翻译额度已用完，请明天再试。', limit: limit.limit, remaining: limit.remaining },
        { status: 429 },
      );
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    const language = typeof body?.language === 'string' ? body.language : 'Chinese';
    const mode = resolveRequestRuntimeMode(body?.mode);
    if (mode === 'api' && !canUseCustomApiInRequest(mode)) {
      return NextResponse.json({ error: getApiModeBlockedMessage() }, { status: 403 });
    }

    const apiConfig = canUseCustomApiInRequest(mode) ? body?.apiConfig : undefined;

    if (!text.trim()) {
      return NextResponse.json({ error: '待翻译文本不能为空。' }, { status: 400 });
    }

    const result = await translateWithMiniMax(text, language, apiConfig);
    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || '翻译失败，请稍后重试。';
    const status = message === 'MANAGED_PROVIDER_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
