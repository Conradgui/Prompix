import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { getManagedProvider } from '@/lib/server/managed-ops';
import { canUseCustomApiInRequest, getApiModeBlockedMessage, resolveRequestRuntimeMode } from '@/lib/server/runtime-policy';

export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimit(req, 'chat');
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '今日对话额度已用完，请明天再试。', limit: limit.limit, remaining: limit.remaining },
        { status: 429 },
      );
    }

    const body = await req.json();
    const history = Array.isArray(body?.history) ? body.history : [];
    const message = typeof body?.message === 'string' ? body.message : '';
    const image = typeof body?.image === 'string' ? body.image : undefined;
    const settings = body?.settings;
    const mode = resolveRequestRuntimeMode(body?.mode);
    if (mode === 'api' && !canUseCustomApiInRequest(mode)) {
      return NextResponse.json({ error: getApiModeBlockedMessage() }, { status: 403 });
    }

    const apiConfig = canUseCustomApiInRequest(mode) ? body?.apiConfig : undefined;

    if (!message.trim()) {
      return NextResponse.json({ error: '问题内容不能为空。' }, { status: 400 });
    }

    const provider = getManagedProvider(apiConfig);
    const stream = await provider.chatStream(history, message, image, settings);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    const message = error?.message || '对话失败，请稍后重试。';
    const status = message === 'MANAGED_PROVIDER_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
