import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { termFollowupWithProvider } from '@/lib/server/managed-ops';
import { canUseCustomApiInRequest, getApiModeBlockedMessage, resolveRequestRuntimeMode } from '@/lib/server/runtime-policy';

export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimit(req, 'chat');
    if (!limit.allowed) {
      return NextResponse.json(
        { error: '今日术语追问额度已用完，请明天再试。', limit: limit.limit, remaining: limit.remaining },
        { status: 429 },
      );
    }

    const body = await req.json();
    const term = typeof body?.term === 'string' ? body.term : '';
    const language = typeof body?.language === 'string' ? body.language : 'Chinese';
    const definition = typeof body?.definition === 'string' ? body.definition : '';
    const application = typeof body?.application === 'string' ? body.application : '';
    const thinking = typeof body?.thinking === 'string' ? body.thinking : '';
    const history = Array.isArray(body?.history) ? body.history : [];
    const message = typeof body?.message === 'string' ? body.message : '';

    const mode = resolveRequestRuntimeMode(body?.mode);
    if (mode === 'api' && !canUseCustomApiInRequest(mode)) {
      return NextResponse.json({ error: getApiModeBlockedMessage() }, { status: 403 });
    }

    const apiConfig = canUseCustomApiInRequest(mode) ? body?.apiConfig : undefined;

    if (!term.trim()) {
      return NextResponse.json({ error: '术语不能为空。' }, { status: 400 });
    }

    if (!message.trim()) {
      return NextResponse.json({ error: '追问内容不能为空。' }, { status: 400 });
    }

    const result = await termFollowupWithProvider({
      term,
      language,
      definition,
      application,
      thinking,
      history,
      message,
      customConfig: apiConfig,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || '术语追问失败，请稍后重试。';
    const status = message === 'MANAGED_PROVIDER_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
