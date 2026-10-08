import type { RaindropAuthState, RaindropTokenResponse } from '@arcable/shared/types';
import { getRaindropTokenExpiresAt, RaindropReauthenticationError } from '@arcable/shared/utils';

export function createRaindropSessionManager(adapter: {
  load: () => Promise<RaindropAuthState>;
  save: (auth: RaindropAuthState) => Promise<void>;
  invalidate: () => Promise<void>;
  refresh: (token: string) => Promise<RaindropTokenResponse>;
}) {
  let renewal: Promise<string> | undefined;
  const resolve = async (requestedToken: string, force = false): Promise<string> => {
    const auth = await adapter.load();
    if (!auth.isAuthenticated || !auth.accessToken) throw new RaindropReauthenticationError();
    // A concurrent request already refreshed this rejected token.
    if (force && requestedToken !== auth.accessToken) return auth.accessToken;
    if (auth.authType !== 'oauth') return auth.accessToken;
    if (!force && (!auth.expiresAt || auth.expiresAt > Date.now() + 60_000)) return auth.accessToken;
    if (renewal) return renewal;
    renewal = (async () => {
      try {
        if (!auth.refreshToken) throw new RaindropReauthenticationError();
        const tokens = await adapter.refresh(auth.refreshToken);
        const current = await adapter.load();
        // Logout/new login during renewal must not resurrect the old session.
        if (current.accessToken !== auth.accessToken || current.refreshToken !== auth.refreshToken) {
          if (current.isAuthenticated && current.accessToken) return current.accessToken;
          throw new RaindropReauthenticationError();
        }
        await adapter.save({ ...auth, accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || auth.refreshToken,
          expiresAt: getRaindropTokenExpiresAt(tokens) });
        return tokens.access_token;
      } catch (error) {
        if (error instanceof RaindropReauthenticationError) {
          const current = await adapter.load();
          if (current.accessToken === auth.accessToken && current.refreshToken === auth.refreshToken) {
            await adapter.invalidate();
          }
        }
        throw error;
      }
    })().finally(() => { renewal = undefined; });
    return renewal;
  };
  return { resolve };
}

export async function refreshExtensionRaindropToken(refreshToken: string): Promise<RaindropTokenResponse> {
  // Renew with the same OAuth application that issued the extension session.
  const response = await fetch('https://oh-auth.vercel.app/auth/raindrop/refresh', {
    method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // The broker wraps upstream failures in HTTP 400, including outages.
    // Only an explicit rejected grant invalidates the stored session.
    if (/invalid_grant|bad_refresh_token|invalid_refresh_token|invalid refresh token|refresh token (?:is )?(?:invalid|expired|revoked)/i.test(String(data.error || ''))) {
      throw new RaindropReauthenticationError();
    }
    throw new Error(`Raindrop token renewal failed (${response.status}). Please try again.`);
  }
  return data as RaindropTokenResponse;
}
