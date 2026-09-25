import { NextRequest, NextResponse } from 'next/server';
import { setSyncProviderCookie } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const provider = body?.provider;
  if (provider !== 'raindrop' && provider !== 'drive') {
    return NextResponse.json({ success: false, error: 'Unknown sync backend' }, { status: 400 });
  }
  const response = NextResponse.json({ success: true, provider });
  setSyncProviderCookie(response, provider);
  return response;
}
