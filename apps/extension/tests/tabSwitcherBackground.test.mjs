import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const handlers = {};
const event = (name) => ({ addListener(fn) { handlers[name] = fn; } });
let tabs = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, windowId: 10, active: index === 0, lastAccessed: index * 100, title: `Tab ${index + 1}`, url: `https://example.com/${index}` }));
const updates = [];
const forwards = [];
const browser = {
  tabs: {
    query: async ({ windowId, active }) => tabs.filter((t) => (windowId === undefined || t.windowId === windowId) && (!active || t.active)),
    update: async (...args) => updates.push(args),
    sendMessage: async (...args) => forwards.push(args),
    onActivated: event('activated'), onUpdated: event('updated'), onRemoved: event('removed'),
  },
  windows: { onFocusChanged: event('focused') },
};
const source = await readFile(new URL('../src/background/tabSwitcher.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const sandbox = { exports: {}, require: () => browser, setTimeout: () => 1, clearTimeout() {}, Date };
vm.runInNewContext(js, sandbox);
const { handleTabSwitcherMessage: message, initTabSwitcherBackground: init } = sandbox.exports;
const sender = { tab: tabs[0], frameId: 0 };
init();
assert.equal(message({ type: 'OTHER' }, sender), undefined);
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, {})).success, false);
let result = await message({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, sender);
assert.deepEqual(Array.from(result.tabs, (tab) => tab.id), [1, 7, 6, 5, 4]);
handlers.activated({ tabId: 2, windowId: 10 });
result = await message({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, sender);
assert.deepEqual(Array.from(result.tabs, (tab) => tab.id), [1, 2, 7, 6, 5]);
tabs = tabs.filter((tab) => tab.id !== 2);
result = await message({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, sender);
assert.equal(result.tabs.some((tab) => tab.id === 2), false);
sandbox.Date = { now: () => 9_000_000_000_000 };
handlers.activated({ tabId: 3, windowId: 10 });
handlers.activated({ tabId: 4, windowId: 10 });
result = await message({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, sender);
assert.deepEqual(Array.from(result.tabs, (tab) => tab.id).slice(0, 3), [1, 4, 3], 'same-millisecond activations retain exact MRU event order');
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_ACTIVATE', tabId: 7 }, sender)).success, true);
assert.equal(updates[0][0], 7);
tabs.push({ id: 100, windowId: 99, active: true });
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_ACTIVATE', tabId: 100 }, sender)).success, false);
await message({ type: 'ARCABLE_TAB_SWITCHER_KEY', action: 'next' }, { ...sender, frameId: 4 });
assert.equal(forwards[0][0], 1);
assert.equal(forwards[0][2].frameId, 0);
// The side panel has no sender tab; its keys go to the top frame of its window's active tab.
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_PANEL_KEY', action: 'next', windowId: 10 }, {})).success, true);
assert.equal(forwards[1][0], 1);
assert.deepEqual({ ...forwards[1][1] }, { type: 'ARCABLE_TAB_SWITCHER_KEY', action: 'next' });
assert.equal(forwards[1][2].frameId, 0);
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_PANEL_KEY', action: 'bogus', windowId: 10 }, {})).success, false);
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_PANEL_KEY', action: 'commit' }, {})).success, false);
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_PANEL_KEY', action: 'commit', windowId: 404 }, {})).success, false);
assert.equal(forwards.length, 2);
tabs[0].active = false;
assert.equal((await message({ type: 'ARCABLE_TAB_SWITCHER_ACTIVATE', tabId: 7 }, sender)).success, false);
assert.equal(updates.length, 1);
console.log('Tab switcher background behavior tests passed.');

// Drive scheduled captures through the real service with a large source bitmap.
let timer;
let captured = 0;
let resized;
let releaseCapture;
let delayCapture = false;
const active = { id: 1, windowId: 10, active: true, title: 'Current', url: 'https://example.com/' };
const imageBrowser = {
  tabs: {
    query: async () => [active], get: async () => active,
    captureVisibleTab: async () => { captured++; if (delayCapture) await new Promise((resolve) => { releaseCapture = resolve; }); return 'data:image/jpeg;base64,full'; },
    onActivated: event('captureActivated'), onUpdated: event('captureUpdated'), onRemoved: event('captureRemoved'),
  },
  windows: { get: async () => ({ focused: true }), onFocusChanged: event('captureFocused') },
};
const imageSandbox = {
  exports: {}, require: () => imageBrowser, Date,
  setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout: () => { timer = undefined; },
  fetch: async () => ({ blob: async () => ({}) }),
  createImageBitmap: async () => ({ width: 2400, height: 1800, close() {} }),
  OffscreenCanvas: class {
    constructor(width, height) { this.width = width; this.height = height; resized = [width, height]; }
    getContext() { return { drawImage() {} }; }
    async convertToBlob(options) { assert.equal(options.type, 'image/jpeg'); assert.equal(options.quality, 0.55); return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
  },
  btoa: (binary) => Buffer.from(binary, 'binary').toString('base64'),
};
vm.runInNewContext(js, imageSandbox);
const imageMessage = imageSandbox.exports.handleTabSwitcherMessage;
const imageSender = { tab: active };
const flush = () => new Promise((resolve) => setImmediate(resolve));
imageSandbox.exports.initTabSwitcherBackground();
await flush();
timer();
await flush();
assert.deepEqual(resized, [267, 200], 'large captures preserve aspect ratio inside 320x200');
result = await imageMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, imageSender);
assert.equal(result.tabs[0].thumbnail, 'data:image/jpeg;base64,AQID', 'only reduced image is cached');
handlers.captureUpdated(1, { status: 'complete' }, active);
timer();
await flush();
assert.equal(captured, 1, 'open overlay prevents capture');
await imageMessage({ type: 'ARCABLE_TAB_SWITCHER_VISIBILITY', open: false }, imageSender);
active.url = 'https://example.com/new';
handlers.captureUpdated(1, { url: active.url, status: 'complete' }, active);
delayCapture = true;
timer();
await flush();
await imageMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, imageSender);
releaseCapture();
await flush();
result = await imageMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, imageSender);
assert.equal(result.tabs[0].thumbnail, undefined, 'capture racing overlay opening is discarded');
console.log('Tab switcher thumbnail sizing and overlay race tests passed.');

// Session storage contains reduced previews and restores them after a worker restart.
let sessionData = {};
imageBrowser.storage = { session: {
  get: async () => structuredClone(sessionData),
  set: async (value) => { sessionData = structuredClone(value); },
} };
delayCapture = false;
const persistSandbox = { ...imageSandbox, exports: {} };
vm.runInNewContext(js, persistSandbox);
persistSandbox.exports.initTabSwitcherBackground();
await flush();
timer();
await flush();
assert.equal(sessionData.arcable_tab_switcher_previews_v1[0].image, 'data:image/jpeg;base64,AQID');
const restartSandbox = { ...imageSandbox, exports: {} };
vm.runInNewContext(js, restartSandbox);
restartSandbox.exports.initTabSwitcherBackground();
result = await restartSandbox.exports.handleTabSwitcherMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, imageSender);
assert.equal(result.tabs[0].thumbnail, 'data:image/jpeg;base64,AQID', 'suspended worker restores scaled preview from session');

// A removal arriving during the asynchronous storage read wins over old storage.
let releaseRestore;
imageBrowser.storage.session.get = () => new Promise((resolve) => { releaseRestore = () => resolve(structuredClone(sessionData)); });
const raceSandbox = { ...imageSandbox, exports: {} };
vm.runInNewContext(js, raceSandbox);
raceSandbox.exports.initTabSwitcherBackground();
handlers.captureRemoved(1);
releaseRestore();
result = await raceSandbox.exports.handleTabSwitcherMessage({ type: 'ARCABLE_TAB_SWITCHER_LIST' }, imageSender);
assert.equal(result.tabs[0].thumbnail, undefined, 'restoration cannot resurrect a removed preview');
await flush();
assert.equal(sessionData.arcable_tab_switcher_previews_v1.length, 0);
console.log('Tab switcher worker restart and restoration race tests passed.');

let finishQuery;
let queries = 0;
const ordered = [];
browser.tabs.query = async () => { queries++; if (queries === 1) await new Promise((resolve) => { finishQuery = resolve; }); return [{ ...sender.tab, active: true }]; };
browser.tabs.sendMessage = async (_id, message) => ordered.push(message.action);
const opening = message({ type: 'ARCABLE_TAB_SWITCHER_KEY', action: 'next' }, sender);
const release = message({ type: 'ARCABLE_TAB_SWITCHER_KEY', action: 'commit' }, sender);
await flush();
assert.equal(queries, 1, 'later iframe inputs wait for earlier delivery');
finishQuery();
await Promise.all([opening, release]);
assert.deepEqual(ordered, ['next', 'commit']);
console.log('Tab switcher iframe input ordering test passed.');
