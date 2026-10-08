import { withRaindropSession, getSessionAccessToken, getSessionExpiresAt } from '@/lib/raindropSession';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  fetchRaindropUser,
  getRaindropTokenFromEnv,
} from '@/lib/raindrop';

export const dynamic = 'force-dynamic';

async function handleGET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const queryToken = request.nextUrl.searchParams.get('token')?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  const envToken = getRaindropTokenFromEnv();

  const hasRefreshToken = Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);
  const token = (hasRefreshToken ? cookieToken : undefined) || authHeader || queryToken || cookieToken || envToken;

  if (!token) {
    return NextResponse.json({
      isAuthenticated: false,
      user: null,
      token: null,
    });
  }

  const user = await fetchRaindropUser(token);

  if (!user) {
    // A failed profile lookup may be a network or Raindrop service outage.
    // Only an explicit OAuth refresh rejection clears the session in the wrapper.
    return NextResponse.json({ error: 'Unable to verify Raindrop right now. Please retry.' }, { status: 503 });
  }

  const authType = hasRefreshToken ? 'oauth' : 'token';

  return NextResponse.json({
    isAuthenticated: true,
    user,
    token: hasRefreshToken ? getSessionAccessToken(token) : token,
    authType,
    expiresAt: hasRefreshToken ? getSessionExpiresAt() : undefined,
  });
}

export const GET = withRaindropSession(handleGET);
