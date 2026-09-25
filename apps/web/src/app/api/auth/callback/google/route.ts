import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { exchangeGoogleAuthCode } from '@arcable/shared/utils';
import { getAuthCookieOptions } from '@/lib/raindrop';
import {
  GOOGLE_STATE_COOKIE,
  getActiveSyncProvider,
  getGoogleConfig,
  getSafeOrigin,
  hasRaindropSession,
  setGoogleTokenCookies,
  setSyncProviderCookie,
} from '@/lib/google';

export const dynamic = 'force-dynamic';

function statesMatch(saved: string | undefined, received: string | null): boolean {
  if (!saved || !received) return false;
  const a = Buffer.from(saved);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const baseUrl = new URL('/', getSafeOrigin(request));
  const fail = (message: string) => {
    baseUrl.searchParams.set('error', message);
    const response = NextResponse.redirect(baseUrl);
    response.cookies.set(GOOGLE_STATE_COOKIE, '', getAuthCookieOptions(0));
    return response;
  };

  const error = searchParams.get('error');
  if (error) return fail(searchParams.get('error_description') || error);
  const code = searchParams.get('code');
  if (!code) return fail('No authorization code provided from Google');
  if (!statesMatch(request.cookies.get(GOOGLE_STATE_COOKIE)?.value, searchParams.get('state'))) {
    return fail('Invalid state parameter (CSRF protection)');
  }

  try {
    const tokens = await exchangeGoogleAuthCode(code, getGoogleConfig());
    baseUrl.searchParams.set('auth', 'success');
    const response = NextResponse.redirect(baseUrl);
    setGoogleTokenCookies(response, tokens);
    response.cookies.set(GOOGLE_STATE_COOKIE, '', getAuthCookieOptions(0));
    // Signing in makes Drive active unless the current backend is still signed
    // in; switching between two signed-in backends goes through migration.
    const active = getActiveSyncProvider(request);
    if (active !== 'drive' && !hasRaindropSession(request)) {
      setSyncProviderCookie(response, 'drive');
    }
    return response;
  } catch (err: any) {
    return fail(err?.message || 'Failed to exchange Google authorization code');
  }
}
