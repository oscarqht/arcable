import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const background = transpile(await readFile(new URL('../src/background/index.ts', import.meta.url), 'utf8'));
const switcher = transpile(await readFile(new URL('../src/background/tabSwitcher.ts', import.meta.url), 'utf8'));
const bridge = transpile(await readFile(new URL('../src/content/oauth-bridge.ts', import.meta.url), 'utf8'));

// Start the real background entry point and tab switcher with Android-like APIs;
// other modules and the Raindrop service are isolated so no network is needed.
for (const windows of [undefined, {}, { onFocusChanged: { addListener() {} } }]) {
  const listeners = [];
  const opened = [];
  const saved = {};
  const event = () => ({ addListener() {} });
  const storage = {
    get: async () => ({ ...saved }),
    set: async value => Object.assign(saved, value),
    remove: async keys => { for (const key of [keys].flat()) delete saved[key]; },
  };
  const browser = {
    windows,
    tabs: { onActivated: event(), onUpdated: event(), onRemoved: event(), query: async () => [],
      create: async details => { opened.push(details); } },
    storage: { local: storage, onChanged: event() },
    runtime: { id: 'test-extension', onMessage: { addListener: fn => listeners.push(fn) },
      onConnect: event(), onInstalled: event(), onStartup: event(), getURL: path => `moz-extension://test/${path}` },
    action: { onClicked: event() },
  };
  const shared = {
    fetchRaindropUser: async token => token === 'invalid' ? null : { _id: 1 },
    fetchRaindropWorkspace: async () => ({ success: false }),
    setRaindropTokenResolver() {}, getRaindropTokenExpiresAt: () => 12345,
    RaindropReauthenticationError: class extends Error {},
  };
  const stubs = {
    './floatingPanels': { initFloatingPanels() {}, handleFloatingPanelsMessage() {} },
    './extensionAction': { initExtensionActionBehavior() {}, syncExtensionActionBehavior() {} },
    './tabActivation': { handleTabActivationMessage() {} },
    './raindropSession': { createRaindropSessionManager: () => ({ resolve: async token => token }) },
    './runCodeRunner': { initRunCodeBackgroundListeners() {} },
    './contextMenus': { initContextMenuListeners() {} },
    './autoPip': { initAutoPipBackground() {} },
    './hideScrollbars': { initHideScrollbarsBackground() {} },
  };
  const sandbox = { exports: {}, chrome: { runtime: {} }, console, setTimeout, clearTimeout, URL, URLSearchParams,
    require: id => id === 'webextension-polyfill' ? browser : id === '@arcable/shared/utils' ? shared : stubs[id] || {} };
  vm.runInNewContext(switcher, sandbox);
  stubs['./tabSwitcher'] = sandbox.exports;
  vm.runInNewContext(background, { ...sandbox, exports: {} });
  assert.equal(listeners.length, 1, 'authentication listener registered after switcher startup');
  const send = message => listeners[0](message, {});
  assert.equal((await send({ type: 'RAINDROP_LOGIN_TOKEN', payload: { token: ' invalid ' } })).success, false);
  const token = await send({ type: 'RAINDROP_LOGIN_TOKEN', payload: { token: ' personal-token ' } });
  assert.equal(token.success, true);
  assert.equal(saved.arcable_raindrop_auth.authType, 'token');
  assert.equal(saved.arcable_token, 'personal-token');
  await send({ type: 'RAINDROP_LOGOUT' });
  const oauth = await send({ type: 'RAINDROP_START_OAUTH' });
  assert.equal(oauth.success, true);
  assert.equal(oauth.data.status, 'opened_tab');
  assert.equal(new URL(opened[0].url).host, 'oh-auth.vercel.app');
  let receivePageMessage;
  let bridgeResponse;
  const page = { location: { hostname: 'oh-auth.vercel.app', origin: 'https://oh-auth.vercel.app' },
    addEventListener: (_type, fn) => { receivePageMessage = fn; } };
  browser.runtime.sendMessage = message => { bridgeResponse = send(message); return bridgeResponse; };
  vm.runInNewContext(bridge, { exports: {}, window: page, require: () => browser });
  receivePageMessage({ source: page, origin: page.location.origin, data: { type: 'oauth_success',
    tokens: { access_token: 'oauth-token', refresh_token: 'refresh' } } });
  assert.equal((await bridgeResponse).success, true);
  assert.equal(saved.arcable_raindrop_auth.authType, 'oauth');
  assert.equal(saved.arcable_token, 'oauth-token');
  assert.equal(saved.arcable_raindrop_auth.refreshToken, 'refresh');
}
console.log('Firefox mobile background startup and login tests passed.');
