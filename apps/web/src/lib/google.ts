import { NextRequest, NextResponse } from 'next/server';
import {
  ACTIVE_SYNC_PROVIDER_STORAGE_KEY,
  fetchGoogleUser,
  normalizeSyncProviderId,
  refreshGoogleAccessToken,
} from '@arcable/shared/utils';
import type { SyncProviderId } from '@arcable/shared/types';
import { ACCESS_TOKEN_COOKIE, getAuthCookieOptions, getRaindropTokenFromEnv } from '@/lib/raindrop';

export const GOOGLE_ACCESS_TOKEN_COOKIE = 'google_access_token';
export const GOOGLE_REFRESH_TOKEN_COOKIE = 'google_refresh_token';
export const GOOGLE_STATE_COOKIE = 'google_oauth_state';
export const SYNC_PROVIDER_COOKIE = ACTIVE_SYNC_PROVIDER_STORAGE_KEY;
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 180;

export function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google',
  };
}

export function getSafeOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '') || 'http';
  const cleanHost = host.startsWith('0.0.0.0') ? host.replace('0.0.0.0', 'localhost') : host;
  return `${proto}://${cleanHost}`;
}

export function getActiveSyncProvider(request: NextRequest): SyncProviderId {
  return normalizeSyncProviderId(request.cookies.get(SYNC_PROVIDER_COOKIE)?.value);
}

export function setSyncProviderCookie(response: NextResponse, provider: SyncProviderId): void {
  response.cookies.set(SYNC_PROVIDER_COOKIE, provider, getAuthCookieOptions(60 * 60 * 24 * 365));
}

export function hasRaindropSession(request: NextRequest): boolean {
  return Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim() || getRaindropTokenFromEnv());
}

export function setGoogleTokenCookies(
  response: NextResponse,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number }
): void {
  const expiresIn = Number(tokens.expires_in) || 3600;
  // Expire the cookie slightly early so a request never carries a token that
  // Google is about to reject; the refresh cookie then mints a new one.
  response.cookies.set(GOOGLE_ACCESS_TOKEN_COOKIE, tokens.access_token, getAuthCookieOptions(Math.max(60, expiresIn - 120)));
  if (tokens.refresh_token) {
    response.cookies.set(GOOGLE_REFRESH_TOKEN_COOKIE, tokens.refresh_token, getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE));
  }
}

export function clearGoogleCookies(response: NextResponse): void {
  const cleared = getAuthCookieOptions(0);
  response.cookies.set(GOOGLE_ACCESS_TOKEN_COOKIE, '', cleared);
  response.cookies.set(GOOGLE_REFRESH_TOKEN_COOKIE, '', cleared);
  response.cookies.set(GOOGLE_STATE_COOKIE, '', cleared);
}

export interface GoogleSession {
  accessToken?: string;
  /** Present when the access token was refreshed; write it back with {@link applyGoogleSession}. */
  refreshed?: { access_token: string; expires_in?: number };
}

/** Returns the Google access token for this request, refreshing it from the refresh cookie when needed. */
export async function getGoogleSession(request: NextRequest): Promise<GoogleSession> {
  const accessToken = request.cookies.get(GOOGLE_ACCESS_TOKEN_COOKIE)?.value?.trim();
  if (accessToken) return { accessToken };
  const refreshToken = request.cookies.get(GOOGLE_REFRESH_TOKEN_COOKIE)?.value?.trim();
  if (!refreshToken) return {};
  const { clientId, clientSecret } = getGoogleConfig();
  try {
    const tokens = await refreshGoogleAccessToken(refreshToken, { clientId, clientSecret });
    return { accessToken: tokens.access_token, refreshed: tokens };
  } catch (err) {
    console.warn('[GoogleAuth] Failed to refresh Google access token:', err);
    return {};
  }
}

export function applyGoogleSession(response: NextResponse, session: GoogleSession): NextResponse {
  if (session.refreshed) setGoogleTokenCookies(response, session.refreshed);
  return response;
}

export async function getGoogleUserForSession(session: GoogleSession) {
  return session.accessToken ? fetchGoogleUser(session.accessToken) : null;
}
