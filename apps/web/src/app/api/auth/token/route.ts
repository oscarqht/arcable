import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, fetchRaindropUser, getAuthCookieOptions } from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token?.replace(/^Bearer\s+/i, '')?.trim();

    if (!token) {
      return NextResponse.json(
        { error: 'Please enter a valid Raindrop API token.' },
        { status: 400 }
      );
    }

    const user = await fetchRaindropUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid Raindrop API token or unauthorized. Please verify your token in Raindrop Settings → Integrations.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user,
      token,
      authType: 'token',
    });

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      token,
      getAuthCookieOptions(60 * 60 * 24 * 365) // 1 year for personal API token
    );

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to authenticate with token.' },
      { status: 500 }
    );
  }
}
