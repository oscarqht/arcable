import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { buildGoogleAuthUrl } from '@arcable/shared/utils';
import { getAuthCookieOptions } from '@/lib/raindrop';
import { GOOGLE_STATE_COOKIE, getGoogleConfig, getSafeOrigin } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { clientId, redirectUri } = getGoogleConfig();
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/?error=' + encodeURIComponent('GOOGLE_CLIENT_ID is not configured in environment variables.'), getSafeOrigin(request))
    );
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildGoogleAuthUrl(clientId, redirectUri, state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, getAuthCookieOptions(60 * 10));
  return response;
}
