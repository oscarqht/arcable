import { NextRequest, NextResponse } from 'next/server';
import { getRaindropConfig, getRaindropOAuthUrl, STATE_COOKIE, getAuthCookieOptions } from '@/lib/raindrop';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSafeOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'http';
  const cleanHost = host.startsWith('0.0.0.0') ? host.replace('0.0.0.0', 'localhost') : host;
  return `${proto}://${cleanHost}`;
}

export async function GET(request: NextRequest) {
  const safeOrigin = getSafeOrigin(request);
  const searchParams = request.nextUrl.searchParams;
  const fromExt = searchParams.get('ext') === 'true';
  const extId = searchParams.get('extId') || '';

  const { clientId, redirectUri, clientSecret } = getRaindropConfig();

  if (!clientId) {
    return NextResponse.redirect(
      new URL('/?error=' + encodeURIComponent('RAINDROP_CLIENT_ID is not configured in environment variables.'), safeOrigin)
    );
  }

  const payloadObj = {
    id: crypto.randomUUID(),
    origin: safeOrigin,
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
