import { NextRequest, NextResponse } from 'next/server';
import { RaindropReauthenticationError, getRaindropTokenExpiresAt } from '@arcable/shared/utils';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/raindrop';
import { refreshSessionToken, setSessionCookies, clearSessionCookies, TOKEN_EXPIRY_COOKIE } from '@/lib/raindropSession';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const expiresAt = Number(request.cookies.get(TOKEN_EXPIRY_COOKIE)?.value || 0);
  if (!body.force && token && (!refreshToken || expiresAt > Date.now() + 60_000)) {
    return NextResponse.json({ token, expiresAt });
  }
  if (!refreshToken) return NextResponse.json({ error: 'Please log in to Raindrop again.', reauthenticationRequired: true }, { status: 401 });
  try {
    const data = await refreshSessionToken(refreshToken);
    const response = NextResponse.json({ token: data.access_token, expiresAt: getRaindropTokenExpiresAt(data) });
    setSessionCookies(response, data, refreshToken);
    return response;
  } catch (error) {
    const invalid = error instanceof RaindropReauthenticationError;
    const response = NextResponse.json({ error: invalid ? 'Your Raindrop session expired. Please log in again.' : 'Unable to refresh Raindrop right now. Please retry.', reauthenticationRequired: invalid }, { status: invalid ? 401 : 503 });
    if (invalid) clearSessionCookies(response);
    return response;
  }
}
