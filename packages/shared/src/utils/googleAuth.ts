import type { GoogleAuthState, GoogleTokenResponse, GoogleUserProfile } from '../types/google';

export const OH_AUTH_BASE_URL = 'https://oh-auth.vercel.app';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_BASE_SCOPES = 'openid email profile';
/** Google access tokens live for one hour; refresh a little before that. */
export const GOOGLE_TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

/**
 * oh-auth prepends `openid email profile` to the requested scope and forces
 * `access_type=offline&prompt=consent`, so a refresh token is always issued.
 */
export function buildOhAuthGoogleUrl(state: string, baseUrl: string = OH_AUTH_BASE_URL): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/auth/google`);
  url.searchParams.set('scope', GOOGLE_DRIVE_FILE_SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

/** Authorization URL for the web app's own server-side code exchange. */
export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', `${GOOGLE_BASE_SCOPES} ${GOOGLE_DRIVE_FILE_SCOPE}`);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  return url.toString();
}

async function postTokenRequest(url: string, body: URLSearchParams | string, json: boolean): Promise<GoogleTokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `Google token request failed (${res.status}).`);
  }
  return data;
}

export async function exchangeGoogleAuthCode(
  code: string,
  config: { clientId: string; clientSecret: string; redirectUri: string }
): Promise<GoogleTokenResponse> {
  return postTokenRequest(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
    false
  );
}

/**
 * Refreshes an access token. With client credentials (web server) Google is
 * called directly; without them (extension) the request goes through oh-auth,
 * which holds the client secret. Google omits `refresh_token` on refresh.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  options?: { clientId?: string; clientSecret?: string; ohAuthBaseUrl?: string }
): Promise<GoogleTokenResponse> {
  if (!refreshToken) throw new Error('Missing Google refresh token.');
  if (options?.clientId && options?.clientSecret) {
    return postTokenRequest(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: 'refresh_token',
      }),
      false
    );
  }
  const base = (options?.ohAuthBaseUrl || OH_AUTH_BASE_URL).replace(/\/$/, '');
  return postTokenRequest(`${base}/auth/google/refresh`, JSON.stringify({ refresh_token: refreshToken }), true);
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUserProfile | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.sub) return null;
    return {
      id: String(data.sub),
      name: data.name || data.email || 'Google user',
      email: data.email,
      avatarUrl: data.picture,
    };
  } catch {
    return null;
  }
}

export function toGoogleAuthState(
  tokens: Pick<GoogleTokenResponse, 'access_token' | 'refresh_token' | 'expires_in'>,
  user: GoogleUserProfile | undefined,
  previous?: GoogleAuthState,
  now: number = Date.now()
): GoogleAuthState {
  const expiresIn = Number(tokens.expires_in);
  return {
    isAuthenticated: true,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || previous?.refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    user: user || previous?.user,
  };
}

export function isGoogleTokenExpiring(
  auth: Pick<GoogleAuthState, 'expiresAt'> | undefined | null,
  now: number = Date.now(),
  bufferMs: number = GOOGLE_TOKEN_REFRESH_BUFFER_MS
): boolean {
  if (!auth?.expiresAt) return true;
  return auth.expiresAt - bufferMs <= now;
}
