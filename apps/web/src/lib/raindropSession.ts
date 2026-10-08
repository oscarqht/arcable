import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest, NextResponse } from 'next/server';
import { RaindropReauthenticationError, refreshRaindropOAuthToken, getRaindropTokenExpiresAt, setRaindropTokenResolver } from '@arcable/shared/utils';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getAuthCookieOptions, getRaindropConfig } from './raindrop';
import type { RaindropTokenResponse } from '@arcable/shared/types';

export const TOKEN_EXPIRY_COOKIE = 'raindrop_token_expires_at';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;
type Session = { token: string; refreshToken: string; expiresAt: number; updated: boolean; invalid: boolean };
const sessions = new AsyncLocalStorage<Session>();
// A short result cache also handles parallel requests carrying the old rotated token.
const refreshes = new Map<string, { promise: Promise<RaindropTokenResponse>; until: number }>();
export async function refreshSessionToken(refreshToken: string) {
  const now = Date.now();
  for (const [key, entry] of refreshes) if (entry.until < now) refreshes.delete(key);
  const existing = refreshes.get(refreshToken);
  if (existing) return existing.promise;
  const { clientId, clientSecret } = getRaindropConfig();
  if (!clientId || !clientSecret) throw new Error('Raindrop OAuth refresh is not configured.');
  if (refreshes.size >= 1000) refreshes.delete(refreshes.keys().next().value!);
  const promise = refreshRaindropOAuthToken(refreshToken, clientId, clientSecret);
  refreshes.set(refreshToken, { promise, until: now + 60_000 });
  try { return await promise; } catch (error) { refreshes.delete(refreshToken); throw error; }
}
async function resolveSessionToken(token: string, force: boolean) {
  const session = sessions.getStore();
  if (!session || !session.refreshToken) return token;
  // A stale caller token must not force a second refresh after this request refreshed.
  if (force && token !== session.token) return session.token;
  if (!force && session.token && session.expiresAt > Date.now() + 60_000) return session.token;
  try {
    const data = await refreshSessionToken(session.refreshToken);
    session.token = data.access_token;
    session.refreshToken = data.refresh_token || session.refreshToken;
    session.expiresAt = getRaindropTokenExpiresAt(data);
    session.updated = true;
    return session.token;
  } catch (error) {
    if (error instanceof RaindropReauthenticationError) session.invalid = true;
    throw error;
  }
}
setRaindropTokenResolver(resolveSessionToken);

export function getSessionExpiresAt() {
  return sessions.getStore()?.expiresAt || 0;
}

export function getSessionAccessToken(fallback: string) {
  return sessions.getStore()?.token || fallback;
}

export function setSessionCookies(response: NextResponse, data: RaindropTokenResponse, previousRefreshToken = '') {
  response.cookies.set(ACCESS_TOKEN_COOKIE, data.access_token, getAuthCookieOptions(SESSION_MAX_AGE));
  response.cookies.set(REFRESH_TOKEN_COOKIE, data.refresh_token || previousRefreshToken, getAuthCookieOptions(SESSION_MAX_AGE));
  response.cookies.set(TOKEN_EXPIRY_COOKIE, String(getRaindropTokenExpiresAt(data)), getAuthCookieOptions(SESSION_MAX_AGE));
}
export function clearSessionCookies(response: NextResponse) {
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, TOKEN_EXPIRY_COOKIE]) response.cookies.set(name, '', getAuthCookieOptions(0));
}
export function withRaindropSession(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest) => {
    const session: Session = {
      token: request.cookies.get(ACCESS_TOKEN_COOKIE)?.value || '',
      refreshToken: request.cookies.get(REFRESH_TOKEN_COOKIE)?.value || '',
      expiresAt: Number(request.cookies.get(TOKEN_EXPIRY_COOKIE)?.value || 0),
      updated: false, invalid: false,
    };
    return sessions.run(session, async () => {
      let response: NextResponse;
      try {
        if (session.refreshToken) {
          await resolveSessionToken(session.token, false);
          // Legacy sessions may no longer have an access cookie. Restore it for handlers.
          request.cookies.set(ACCESS_TOKEN_COOKIE, session.token);
        }
        response = await handler(request);
      } catch (error) {
        response = NextResponse.json({ error: error instanceof Error ? error.message : 'Raindrop request failed.' }, { status: 503 });
      }
      if (session.invalid) {
        response = NextResponse.json({ error: 'Your Raindrop session expired. Please log in again.', reauthenticationRequired: true }, { status: 401 });
        clearSessionCookies(response);
      } else if (session.updated) {
        response.cookies.set(ACCESS_TOKEN_COOKIE, session.token, getAuthCookieOptions(SESSION_MAX_AGE));
        response.cookies.set(REFRESH_TOKEN_COOKIE, session.refreshToken, getAuthCookieOptions(SESSION_MAX_AGE));
        response.cookies.set(TOKEN_EXPIRY_COOKIE, String(session.expiresAt), getAuthCookieOptions(SESSION_MAX_AGE));
      }
      return response;
    });
  };
}
