import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { require, mockModules, event, storage } from './testLoader.mjs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.safari.json', import.meta.url)));
assert.deepEqual(manifest.background, { scripts: ['background.js'] });
for (const permission of ['identity', 'userScripts', 'declarativeNetRequestWithHostAccess'])
  assert(!manifest.permissions.includes(permission));
assert(!manifest.externally_connectable);
const changed = event();
const data = {};
let scheme = 'safari-web-extension';
const sent = [];
const browser = {
  runtime: {
    id: 'safari-test', getURL: p => `${scheme}://test/${p}`,
    onMessage: event(), sendMessage: async m => { sent.push(m); return { success: true }; },
  },
  storage: { local: storage(data, changed), onChanged: changed },
  tabs: { onRemoved: event(), sendMessage: async (...args) => sent.push(args),
    get: async id => ({ id, url: 'https://example.com/next' }), query: async () => [] },
  // Deliberately omit DNR, webRequest, unsupported history/fragment events.
  webNavigation: { onCommitted: event() },
};
mockModules({ 'webextension-polyfill': browser });
const utils = require('../src/utils/browser.ts');
assert(utils.isSafari());
assert(utils.isInternalOrExtensionUrl('safari-web-extension://test/options/index.html'));
assert.equal(await utils.checkUserScriptsAvailable(), false);
const embedding = require('../src/background/panelEmbedding.ts');
embedding.initPanelEmbedding();
await embedding.preparePanelEmbedding(1, 2);
await embedding.forgetPanelEmbedding(1);
const floating = require('../src/background/floatingPanels.ts');
floating.initFloatingPanels(); // Missing Safari events must not abort background startup.
await floating.handleFloatingPanelsMessage({ type: 'ARCABLE_LOCATION_CHANGED' }, {
  id: browser.runtime.id, tab: { id: 1 }, frameId: 0,
});
assert.equal(sent.at(-1)[1].type, 'ARCABLE_PANELS_STATE');
require('../src/background/autoPip.ts').initAutoPipBackground(); // No tab activation dependency in Safari.
const runner = require('../src/background/runCodeRunner.ts');
await assert.rejects(runner.executeManualUserCode(1, '1'), /Safari does not support/);
await assert.rejects(runner.executeAutomaticCustomCode(1, '1'), /Safari does not support/);

// Safari login uses the content bridge, with no identity or external messaging API.
let receive;
globalThis.window = {
  location: { hostname: 'arcable.vercel.app', origin: 'https://arcable.vercel.app' },
  addEventListener: (name, listener) => { if (name === 'message') receive = listener; },
};
require('../src/content/oauth-bridge.ts');
const oauth = { source: window, origin: window.location.origin,
  data: { type: 'oauth_success', tokens: { access_token: 'test-token' } } };
receive(oauth);
assert.equal(sent.at(-1).type, 'oauth_bridge_success');
const beforeInvalid = sent.length;
receive({ ...oauth, source: {} });
receive({ ...oauth, origin: 'https://other.example' });
assert.equal(sent.length, beforeInvalid);

// Simulate pushState/replaceState/fragment changes in the isolated content world.
const styles = new Map();
globalThis.location = { href: 'https://example.com/start' };
let tick;
globalThis.window = { location, setInterval: fn => { tick = fn; } };
globalThis.document = {
  getElementById: id => styles.get(id),
  createElement: () => ({ setAttribute() {}, remove() { styles.delete(this.id); } }),
  head: { appendChild: el => styles.set(el.id, el) },
};
data.customCodeRules = [{ id: 'css', pattern: 'https://example.com/next*', css: 'body { color: red }', js: 'throw 1' }];
const { CustomCodeInjector } = require('../src/content/custom-js-css.ts');
new CustomCodeInjector();
await new Promise(resolve => setImmediate(resolve));
assert.equal(styles.size, 0);
location.href = 'https://example.com/next#spa';
tick();
assert.equal(styles.size, 1);
assert.equal(sent.at(-1).type, 'ARCABLE_LOCATION_CHANGED');
assert(!sent.some(m => m.type === 'INJECT_CUSTOM_JS'));
location.href = 'https://example.com/elsewhere';
tick();
assert.equal(styles.size, 0);
const messageCount = sent.length;
tick();
assert.equal(sent.length, messageCount, 'Unchanged URLs should not send messages');
scheme = 'chrome-extension';
assert.equal(utils.isSafari(), false);
console.log('PASS Safari minimal APIs, script limitations, ordinary embedding, SPA panels and CSS reconciliation');
