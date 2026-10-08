import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { AsyncLocalStorage } from 'node:async_hooks';
const require = createRequire(import.meta.url);
const ts = require('typescript');
class ReauthenticationError extends Error {}
let resolver;
let refreshCalls = [];
let refresh = async (token) => ({ access_token: `new-${token}`, refresh_token: `rotated-${token}`, expires_in: 3600 });
class Response {
  constructor(body, status = 200) { this.body = body; this.status = status; this.saved = new Map(); this.cookies = { set: (key, value) => this.saved.set(key, value) }; }
  static json(body, options) { return new Response(body, options?.status); }
}
function request(token, refreshToken, expiresAt) {
  const cookies = new Map([['raindrop_access_token', token], ['raindrop_refresh_token', refreshToken], ['raindrop_token_expires_at', String(expiresAt || 0)]]);
  return { cookies: { get: key => cookies.has(key) ? { value: cookies.get(key) } : undefined, set: (key, value) => cookies.set(key, value) } };
}
const source = await readFile(new URL('../src/lib/raindropSession.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: module.exports, module, Date, Map, console,
  require(name) {
    if (name === 'node:async_hooks') return { AsyncLocalStorage };
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@arcable/shared/utils') return {
      RaindropReauthenticationError: ReauthenticationError,
      setRaindropTokenResolver: value => { resolver = value; },
      getRaindropTokenExpiresAt: data => Date.now() + data.expires_in * 1000,
      refreshRaindropOAuthToken: async token => { refreshCalls.push(token); return refresh(token); },
    };
    if (name === './raindrop') return {
      ACCESS_TOKEN_COOKIE: 'raindrop_access_token', REFRESH_TOKEN_COOKIE: 'raindrop_refresh_token',
      getAuthCookieOptions: age => ({ maxAge: age }), getRaindropConfig: () => ({ clientId: 'id', clientSecret: 'secret' }),
    };
    throw Error(`Unexpected dependency ${name}`);
  },
});
const { withRaindropSession } = module.exports;
const route = withRaindropSession(async () => Response.json({ token: await resolver('stale-body-token', false) }));
const expired = await route(request('old', 'valid', 1));
assert.equal(expired.body.token, 'new-valid');
assert.equal(expired.saved.get('raindrop_access_token'), 'new-valid');
assert.equal(expired.saved.get('raindrop_refresh_token'), 'rotated-valid');
assert.ok(Number(expired.saved.get('raindrop_token_expires_at')) > Date.now());
const live = await route(request('live-token', 'live-refresh', Date.now() + 3600_000));
assert.equal(live.body.token, 'live-token');
assert.equal(refreshCalls.length, 1);
const forceRoute = withRaindropSession(async () => Response.json({ token: await resolver('force-old', true) }));
const forced = await forceRoute(request('force-old', 'force-refresh', Date.now() + 3600_000));
assert.equal(forced.body.token, 'new-force-refresh');
assert.equal(forced.status, 200);
// Distinct concurrent sessions must never exchange credentials.
const [one, two] = await Promise.all([route(request('a', 'user-a', 1)), route(request('b', 'user-b', 1))]);
assert.equal(one.body.token, 'new-user-a');
assert.equal(two.body.token, 'new-user-b');
const callsBefore = refreshCalls.length;
await Promise.all([route(request('old', 'parallel', 1)), route(request('old', 'parallel', 1))]);
assert.equal(refreshCalls.length, callsBefore + 1);
refresh = async () => { throw new ReauthenticationError('invalid_grant'); };
const invalid = await route(request('old', 'invalid', 1));
assert.equal(invalid.status, 401);
assert.equal(invalid.body.reauthenticationRequired, true);
assert.equal(invalid.saved.get('raindrop_refresh_token'), '');
const swallowingRoute = withRaindropSession(async () => {
  try { await resolver('swallowed-old', true); } catch {}
  return Response.json({ success: false }, { status: 400 });
});
const swallowed = await swallowingRoute(request('swallowed-old', 'swallowed-invalid', Date.now() + 3600_000));
assert.equal(swallowed.status, 401);
assert.equal(swallowed.body.reauthenticationRequired, true);
refresh = async () => { throw new Error('Service unavailable'); };
const transient = await route(request('old', 'outage', 1));
assert.equal(transient.status, 503);
assert.equal(transient.saved.size, 0);
// Legacy session with an already expired access cookie can still refresh.
refresh = async token => ({ access_token: `restored-${token}`, refresh_token: token, expires_in: 3600 });
const legacy = await route(request('', 'legacy', 1));
assert.equal(legacy.body.token, 'restored-legacy');
console.log('Raindrop session refresh regression tests passed.');
