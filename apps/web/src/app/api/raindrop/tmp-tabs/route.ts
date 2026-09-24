import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, getRaindropTokenFromEnv } from '@/lib/raindrop';
import { fetchRaindropTmpTabs, publishRaindropTmpTabs } from '@arcable/shared/utils';

export const dynamic = 'force-dynamic';

function getToken(request: NextRequest): string {
  return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    || request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim()
    || getRaindropTokenFromEnv();
}

export async function GET(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const result = await fetchRaindropTmpTabs(token);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}

export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as { tabs?: unknown }).tabs)) {
    return NextResponse.json({ success: false, error: 'Invalid temporary tabs payload' }, { status: 400 });
  }

  const payload = body as Parameters<typeof publishRaindropTmpTabs>[1];
  const result = await publishRaindropTmpTabs(token, payload);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
