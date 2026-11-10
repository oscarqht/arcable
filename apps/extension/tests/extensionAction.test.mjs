import assert from 'node:assert/strict';
import { require, mockModules } from './testLoader.mjs';
let clicked, popup, options = 0, captures = 0, creates = [], uploads = [], titles = [];
let authenticated = true, captureFails = false, coverFails = false, createFails = false;
let activeId = 7, currentUrl = 'https://example.com/page', captureWait;
const tab = { id: 7, windowId: 2, url: currentUrl, title: 'Current page' };
const local = {};
const badges = [];
mockModules({
  'webextension-polyfill': {
    action: { onClicked: { addListener: fn => { clicked = fn; } }, setPopup: async value => { popup = value.popup; }, setTitle: async value => { titles.push(value.title); } },
    tabs: { get: async () => ({ ...tab, url: currentUrl }), query: async () => [{ id: activeId }] },
    storage: { local: { set: async values => Object.assign(local, values) } },
  },
  '../utils/browser': { openOptionsPageSafely: async () => { options++; } },
  './screenshot': { captureTabScreenshot: async id => { captures++; assert.equal(id, 7); if (captureWait) await captureWait; return captureFails ? null : 'data:image/png;base64,c2NyZWVuc2hvdA=='; } },
  './badge': { setActionBadge: (...args) => badges.push(args) },
  '@arcable/shared/utils': {
    isPanelUrl: value => /^https?:\/\//.test(value),
    createRaindropBookmark: async (token, input) => { assert.equal(token, 'test-session'); if (createFails) throw new Error('offline'); creates.push(input); return { _id: 123 }; },
    uploadRaindropCover: async (token, id, image) => { uploads.push({ token, id, image }); return coverFails ? null : 'https://cover.example/screenshot.png'; },
  },
});
require('../src/background/extensionAction.ts').initExtensionActionBehavior(async () => ({ isAuthenticated: authenticated, accessToken: authenticated ? 'test-session' : undefined }));
assert.equal(popup, '');
await clicked(tab);
assert.equal(options, 0);
assert.deepEqual(creates[0], { link: tab.url, title: tab.title, collectionId: -1, pleaseParse: { disabled: true } });
assert.deepEqual(uploads[0], { token: 'test-session', id: 123, image: 'data:image/png;base64,c2NyZWVuc2hvdA==' });
assert.equal(badges.at(-1)[0], '✓');
authenticated = false; await clicked(tab);
assert.equal(options, 1); assert.equal(local.optionsInitialTab, 'sync'); assert.equal(creates.length, 1);
authenticated = true;
await clicked({ ...tab, url: 'chrome://extensions' }); assert.equal(captures, 1);
activeId = 8; await clicked(tab); assert.equal(captures, 1); assert.equal(creates.length, 1);
activeId = 7; captureFails = true; await clicked(tab); assert.equal(creates.length, 1);
captureFails = false; currentUrl = 'https://example.com/changed'; await clicked(tab); assert.equal(creates.length, 1);
currentUrl = tab.url;
let release;
captureWait = new Promise(resolve => { release = resolve; });
const saving = clicked(tab);
await new Promise(resolve => setImmediate(resolve));
await clicked(tab); // Repeated clicks while a save is in flight must not duplicate it.
release(); await saving; captureWait = undefined;
assert.equal(creates.length, 2);
coverFails = true; await clicked(tab);
assert.equal(badges.at(-1)[0], '!'); assert.match(titles.at(-1), /Page saved.*cover upload failed/);
coverFails = false; createFails = true; const beforeUploads = uploads.length; await clicked(tab);
assert.equal(uploads.length, beforeUploads); assert.equal(badges.at(-1)[0], '!');
createFails = false; await clicked(tab); assert.equal(badges.at(-1)[0], '✓', 'Failure must release the in-flight guard');
console.log('PASS toolbar Unsorted save, screenshot cover, login fallback, tab-change safety, duplicate clicks, and failure feedback');
