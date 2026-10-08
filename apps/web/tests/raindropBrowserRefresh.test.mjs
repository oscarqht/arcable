import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
class ReauthenticationError extends Error {}
const module = { exports: {} };
let requests = 0;
let fetchResponse;
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../src/lib/raindropBrowserSession.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, Date, Promise, Error,
  require: () => ({ RaindropReauthenticationError: ReauthenticationError }),
  fetch: async () => { requests++; return fetchResponse(); },
});
let generation = 1;
let auth = { isAuthenticated: true, authType: 'oauth', accessToken: 'old' };
let expiresAt = Date.now() + 3600_000;
let invalid = false;
const resolver = module.exports.createBrowserRaindropResolver({
  getAuth: () => auth, getGeneration: () => generation, getExpiresAt: () => expiresAt,
  onToken: (token, expiry) => { auth = { ...auth, accessToken: token }; expiresAt = expiry; },
  onInvalid: () => { invalid = true; },
});
assert.equal(await resolver('old', false), 'old');
assert.equal(requests, 0, 'A valid cached expiry must avoid a refresh endpoint call');
fetchResponse = async () => ({ ok: true, json: async () => ({ token: 'renewed', expiresAt: Date.now() + 3600_000 }) });
assert.equal(await resolver('old', true), 'renewed');
assert.equal(requests, 1);
assert.equal(await resolver('old', true), 'renewed');
assert.equal(requests, 1, 'Another old-token401 must reuse the newer access token');
let finish;
fetchResponse = () => new Promise(resolve => { finish = resolve; });
const oldRefresh = resolver('renewed', true);
auth = { isAuthenticated: false };
generation++;
finish({ ok: true, json: async () => ({ token: 'obsolete', expiresAt: Date.now() + 3600_000 }) });
await assert.rejects(oldRefresh, /session changed/);
assert.equal(auth.isAuthenticated, false, 'A pending refresh must not undo logout');
await assert.rejects(resolver('renewed', false), ReauthenticationError);
auth = { isAuthenticated: true, authType: 'oauth', accessToken: 'new-login' };
generation++;
const oldFailure = resolver('new-login', true);
auth = { isAuthenticated: true, authType: 'oauth', accessToken: 'another-login' };
generation++;
finish({ ok: false, json: async () => ({ reauthenticationRequired: true, error: 'Expired' }) });
await assert.rejects(oldFailure, /session changed/);
assert.equal(invalid, false, 'An old failed refresh must not prompt login in the newer session');
assert.equal(auth.accessToken, 'another-login');
console.log('Browser OAuth cache and session race tests passed.');
