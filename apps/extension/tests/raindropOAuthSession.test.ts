import assert from 'node:assert/strict';
import { createRaindropSessionManager, refreshExtensionRaindropToken } from '../src/background/raindropSession';
import { RaindropReauthenticationError } from '@arcable/shared/utils';
import type { RaindropAuthState } from '@arcable/shared/types';

async function main() {
  let auth: RaindropAuthState = { isAuthenticated: true, authType: 'oauth', accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 };
  let refreshCount = 0;
  let invalidations = 0;
  let refresh = async () => { refreshCount++; return { access_token: 'new', refresh_token: 'rotated', expires_in: 1000 }; };
  const manager = createRaindropSessionManager({ load: async () => auth, save: async value => { auth = value; },
    invalidate: async () => { invalidations++; auth = { isAuthenticated: false }; }, refresh: () => refresh() });
  assert.deepEqual(await Promise.all([manager.resolve('old'), manager.resolve('old'), manager.resolve('old')]), ['new', 'new', 'new']);
  assert.equal(refreshCount, 1);
  assert.equal(auth.refreshToken, 'rotated');
  assert.equal(await manager.resolve('old', true), 'new');
  assert.equal(refreshCount, 1, '401 from the old token reuses the renewed token');
  auth.expiresAt = 1;
  refresh = async () => { throw new Error('offline'); };
  await assert.rejects(manager.resolve('new'), /offline/);
  assert.equal(auth.isAuthenticated, true);
  assert.equal(invalidations, 0);
  refresh = async () => { throw new RaindropReauthenticationError(); };
  await assert.rejects(manager.resolve('new'), RaindropReauthenticationError);
  assert.equal(invalidations, 1);
  auth = { isAuthenticated: true, authType: 'oauth', accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 };
  refresh = async () => { auth = { isAuthenticated: false }; return { access_token: 'new', refresh_token: 'rotated', expires_in: 1000 }; };
  await assert.rejects(manager.resolve('old'), RaindropReauthenticationError);
  assert.equal(auth.isAuthenticated, false, 'logout during renewal must not restore auth');
  auth = { isAuthenticated: true, authType: 'token', accessToken: 'personal', expiresAt: 1 };
  assert.equal(await manager.resolve('personal', true), 'personal');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, 'https://oh-auth.vercel.app/auth/raindrop/refresh');
      assert.deepEqual(JSON.parse(String(init?.body)), { refresh_token: 'refresh' });
      return new Response(JSON.stringify({ access_token: 'renewed' }));
    }) as typeof fetch;
    assert.equal((await refreshExtensionRaindropToken('refresh')).access_token, 'renewed');
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Token refresh failed for raindrop: 503 {}' }), { status: 400 })) as typeof fetch;
    await assert.rejects(refreshExtensionRaindropToken('refresh'), error => !(error instanceof RaindropReauthenticationError));
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Token refresh failed for raindrop: 400 {"error":"invalid_grant"}' }), { status: 400 })) as typeof fetch;
    await assert.rejects(refreshExtensionRaindropToken('refresh'), RaindropReauthenticationError);
  } finally { globalThis.fetch = originalFetch; }
  console.log('Extension OAuth session tests passed.');
}
void main();
