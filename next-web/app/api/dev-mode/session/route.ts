import { NextRequest, NextResponse } from 'next/server';
import {
  attachDeveloperSessionCookie,
  clearDeveloperSessionCookie,
  isDeveloperModePasswordConfigured,
  readDeveloperModeState,
  verifyDeveloperPassword,
} from '@/lib/server/developer-mode';

export async function GET(req: NextRequest) {
  const state = readDeveloperModeState(req);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const state = readDeveloperModeState(req);
  if (state.source === 'local') {
    return NextResponse.json(state);
  }

  if (!isDeveloperModePasswordConfigured()) {
    return NextResponse.json({ error: '开发者口令未配置，暂无法开启开发者模式。' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!verifyDeveloperPassword(password)) {
    return NextResponse.json({ error: '开发者口令错误。' }, { status: 401 });
  }

  const response = NextResponse.json({
    authorized: true,
    source: 'public',
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  });

  return attachDeveloperSessionCookie(response);
}

export async function DELETE() {
  return clearDeveloperSessionCookie(NextResponse.json({ ok: true }));
}
