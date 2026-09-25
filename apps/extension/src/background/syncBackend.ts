import browser from 'webextension-polyfill';
import type { GoogleAuthState, SyncProviderId } from '@arcable/shared/types';
import {
  ACTIVE_SYNC_PROVIDER_STORAGE_KEY,
  buildOhAuthGoogleUrl,
  fetchGoogleUser,
  isGoogleTokenExpiring,
  normalizeSyncProviderId,
  refreshGoogleAccessToken,
  toGoogleAuthState,
} from '@arcable/shared/utils';

export const STORAGE_KEY_GOOGLE_AUTH = 'arcable_google_auth';

export async function getActiveSyncProviderId(): Promise<SyncProviderId> {
  const stored = await browser.storage.local.get(ACTIVE_SYNC_PROVIDER_STORAGE_KEY);
  return normalizeSyncProviderId(stored[ACTIVE_SYNC_PROVIDER_STORAGE_KEY]);
}

export async function setActiveSyncProviderId(id: SyncProviderId): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_SYNC_PROVIDER_STORAGE_KEY]: id });
}

export async function getGoogleAuthState(): Promise<GoogleAuthState> {
  const stored = await browser.storage.local.get(STORAGE_KEY_GOOGLE_AUTH);
  const auth = stored[STORAGE_KEY_GOOGLE_AUTH] as GoogleAuthState | undefined;
  return auth?.isAuthenticated && auth.accessToken ? auth : { isAuthenticated: false };
}

export async function saveGoogleAuthState(auth: GoogleAuthState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY_GOOGLE_AUTH]: auth });
}

export async function clearGoogleAuthState(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY_GOOGLE_AUTH);
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Returns a usable Google access token, refreshing it through oh-auth shortly
 * before it expires. Concurrent callers share one refresh request. A rejected
 * refresh token signs the user out so the UI can ask them to reconnect.
 */
export async function getValidGoogleAccessToken(): Promise<string | null> {
  const auth = await getGoogleAuthState();
  if (!auth.isAuthenticated || !auth.accessToken) return null;
  if (!isGoogleTokenExpiring(auth)) return auth.accessToken;
  if (!auth.refreshToken) return auth.accessToken;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const tokens = await refreshGoogleAccessToken(auth.refreshToken!);
        const next = toGoogleAuthState(tokens, auth.user, auth);
        await saveGoogleAuthState(next);
        return next.accessToken || null;
      } catch (err: any) {
        console.warn('[Arcable Background] Google token refresh failed:', err);
        if (/invalid_grant|revoked|expired/i.test(err?.message || '')) {
          await clearGoogleAuthState();
          return null;
        }
        return auth.accessToken || null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function processGoogleOAuthTokens(tokens: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<GoogleAuthState | null> {
  if (!tokens?.access_token) return null;
  const user = await fetchGoogleUser(tokens.access_token);
  if (!user) return null;
  const previous = await getGoogleAuthState();
  const auth = toGoogleAuthState(
    { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in },
    user,
    previous.isAuthenticated ? previous : undefined
  );
  await saveGoogleAuthState(auth);
  return auth;
}

/**
 * oh-auth delivers the tokens back to the extension (runtime message or the
 * oauth-bridge content script), so the consent screen simply opens in a tab.
 */
export async function startGoogleOAuth(): Promise<void> {
  const state = JSON.stringify({ extensionId: browser.runtime.id, fromExt: true, provider: 'google' });
  await browser.tabs.create({ url: buildOhAuthGoogleUrl(state) });
}
