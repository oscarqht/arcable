import { NextRequest, NextResponse } from 'next/server';
import { getRaindropConfig, getRaindropOAuthUrl, STATE_COOKIE, getAuthCookieOptions } from '@/lib/raindrop';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const searchParams = request.nextUrl.searchParams;
  const fromExt = searchParams.get('ext') === 'true';
  const extId = searchParams.get('extId') || '';

  const { clientId, redirectUri, clientSecret } = getRaindropConfig();

  if (!clientId) {
    return NextResponse.redirect(
      new URL('/?error=' + encodeURIComponent('RAINDROP_CLIENT_ID is not configured in environment variables.'), request.url)
    );
  }

  const payloadObj = {
    id: crypto.randomUUID(),
    origin,
    fromExt,
    extId,
  };
  const payloadStr = JSON.stringify(payloadObj);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');

  let state: string;
  if (clientSecret) {
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(payloadStr);
    const signature = hmac.digest('base64url');
    state = `${payloadB64}.${signature}`;
  } else {
    state = payloadB64;
  }

  const authUrl = getRaindropOAuthUrl(clientId, redirectUri, state);
  const response = NextResponse.redirect(authUrl);

  response.cookies.set(STATE_COOKIE, state, getAuthCookieOptions(60 * 10)); // 10 minutes expiry

  return response;
}
