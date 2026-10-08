import assert from 'node:assert/strict';
import { fetchRaindropCollections, fetchRaindropUser, createRaindropBookmark, setRaindropTokenResolver, refreshRaindropOAuthToken, getRaindropTokenExpiresAt, RaindropReauthenticationError } from '../src/utils/raindropClient';

const originalFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function main() {
  let forced = 0;
  setRaindropTokenResolver(async (token, force) => {
    if (force) { forced++; return 'renewed'; }
    return token;
  });
  const seen: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    const auth = new Headers(init?.headers).get('Authorization')!;
    seen.push(auth);
    return auth === 'Bearer expired' ? json({}, 401) : json({ items: [] });
  }) as typeof fetch;
  await fetchRaindropCollections('expired');
  assert.equal(forced, 2); // collections and child collections each started with the old token
  assert.ok(seen.includes('Bearer renewed'));

  let writes = 0;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url, init) => {
    writes++;
    bodies.push(init?.body);
    assert.equal(init?.method, 'POST');
    return writes === 1 ? json({}, 401) : json({ item: { _id: 123 } });
  }) as typeof fetch;
  await createRaindropBookmark('expired', { link: 'https://example.com', title: 'Example', collectionId: 1 });
  assert.equal(writes, 2, 'an unauthorized write is replayed once after renewal');
  assert.equal(bodies[0], bodies[1], 'renewal preserves the original request payload');

  setRaindropTokenResolver(async () => { throw new Error('Must not resolve another session during login'); });
  globalThis.fetch = (async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer login-token');
    return json({ user: { _id: 42, fullName: 'New User' } });
  }) as typeof fetch;
  assert.equal((await fetchRaindropUser('login-token', { skipAuthRefresh: true }))?.id, 42);

  setRaindropTokenResolver(async () => 'rejected');
  let attempts = 0;
  globalThis.fetch = (async () => { attempts++; return json({}, 401); }) as typeof fetch;
  await assert.rejects(fetchRaindropCollections('rejected'));
  assert.ok(attempts <= 4, 'each request retries auth at most once');
  setRaindropTokenResolver(undefined);

  globalThis.fetch = (async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { grant_type: 'refresh_token', refresh_token: 'refresh', client_id: 'client', client_secret: 'secret' });
    return json({ access_token: 'new', refresh_token: 'rotated', expires_in: 120 });
  }) as typeof fetch;
  const tokens = await refreshRaindropOAuthToken('refresh', 'client', 'secret');
  assert.equal(tokens.refresh_token, 'rotated');
  assert.equal(getRaindropTokenExpiresAt(tokens, 1000), 121000);
  assert.equal(getRaindropTokenExpiresAt({ access_token: 'new' }, 1000), 1000 + 14 * 86400 * 1000);
  globalThis.fetch = (async () => json({ error: 'invalid_grant' }, 400)) as typeof fetch;
  await assert.rejects(refreshRaindropOAuthToken('bad', 'c', 's'), RaindropReauthenticationError);
  globalThis.fetch = (async () => json({}, 503)) as typeof fetch;
  await assert.rejects(refreshRaindropOAuthToken('refresh', 'c', 's'), error => !(error instanceof RaindropReauthenticationError));
  console.log('Raindrop OAuth refresh tests passed.');
}
main().finally(() => { globalThis.fetch = originalFetch; setRaindropTokenResolver(undefined); });
