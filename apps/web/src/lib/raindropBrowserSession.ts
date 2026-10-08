import { RaindropReauthenticationError } from '@arcable/shared/utils';
import type { RaindropAuthState } from '@arcable/shared/types';

export function createBrowserRaindropResolver(options: {
  getAuth: () => RaindropAuthState;
  getGeneration: () => number;
  getExpiresAt: () => number;
  onToken: (token: string, expiresAt: number) => void;
  onInvalid: (message?: string) => void;
}) {
  let pending: { generation: number; force: boolean; promise: Promise<string> } | undefined;
  const resolve = async (token: string, force: boolean): Promise<string> => {
    const auth = options.getAuth();
    if (!auth.isAuthenticated) throw new RaindropReauthenticationError();
    if (auth.authType !== 'oauth') return token;
    if (auth.accessToken && ((force && token !== auth.accessToken) || (!force && options.getExpiresAt() > Date.now() + 60_000))) return auth.accessToken;
    const generation = options.getGeneration();
    if (pending?.generation === generation) {
      if (force && !pending.force) {
        await pending.promise;
        if (generation !== options.getGeneration()) throw new Error('Raindrop session changed.');
        return resolve(token, true);
      }
      return pending.promise;
    }
    const entry = { generation, force, promise: Promise.resolve('') };
    entry.promise = (async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      const data = await response.json();
      if (generation !== options.getGeneration()) throw new Error('Raindrop session changed.');
      if (!response.ok) {
        if (data.reauthenticationRequired) {
          options.onInvalid(data.error);
          throw new RaindropReauthenticationError();
        }
        throw new Error(data.error || 'Unable to refresh Raindrop. Please retry.');
      }
      options.onToken(data.token, Number(data.expiresAt || 0));
      return data.token as string;
    })().finally(() => { if (pending === entry) pending = undefined; });
    pending = entry;
    return entry.promise;
  };
  return resolve;
}
