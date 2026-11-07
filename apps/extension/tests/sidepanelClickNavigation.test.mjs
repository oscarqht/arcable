import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production callbacks and association method with browser API doubles.
const appSource = await readFile(new URL('../src/sidepanel/App.tsx', import.meta.url), 'utf8');
const appFile = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const trackerSource = await readFile(new URL('../src/utils/tabTracker.ts', import.meta.url), 'utf8');
const trackerFile = ts.createSourceFile('tabTracker.ts', trackerSource, ts.ScriptTarget.Latest, true);
function find(file, predicate) {
  let found;
  function visit(node) {
    if (predicate(node)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(found);
  return found;
}
const mobileHelper = find(appFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'getMobileWorkspaceTabId');
const openTab = find(appFile, n => ts.isVariableDeclaration(n) && n.name.getText(appFile) === 'handleOpenTab');
const openVariant = find(appFile, n => ts.isVariableDeclaration(n) && n.name.getText(appFile) === 'handleOpenVariant');
const associate = find(trackerFile, n => ts.isMethodDeclaration(n) && n.name.getText(trackerFile) === 'openAndAssociateTab');
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ mobile = false, android = false, currentTab, currentError = false, failUpdate = false, failBind = false, failVariant = false, tmpTabs = [] } = {}) {
  const calls = [];
  const associations = {};
  const location = { href: 'extension://sidepanel/index.html' };
  const browser = { tabs: {
    getCurrent: async () => { calls.push(['getCurrent']); if (currentError) throw Error('unavailable'); return currentTab; },
    update: async (id, details) => { calls.push(['update', id, details.url]); if (failUpdate) throw Error('failed'); },
    create: async details => { calls.push(['create', details.url, details.active]); return { id: 73, windowId: 2 }; },
  } };
  const tracker = {
    recentlyAssociatedIds: new Map(), pendingTabSpaces: new Map(), currentWorkspaceTabs: [],
    registerPendingCreation() {}, unregisterPendingCreation() {},
    getStoredWorkspaceTabs: () => [], getAssociations: async () => associations,
    saveAssociations: async () => {}, getTmpTabs: async () => [], runWithLock: async fn => fn(),
    activateTab: async (id, win) => calls.push(['activate', id, win]),
    updateAssociatedTabUrl: async (...args) => { calls.push(['variant', ...args]); if (failVariant) throw Error('failed'); },
  };
  const context = {
    browser, tabTracker: tracker, tabAssociations: associations, tmpTabs,
    isMobile: true, // Responsive layout reports mobile even in a narrow desktop panel.
    isMobileDevice: () => mobile, isAndroidPlatform: async () => android,
    clearMousePos() {}, setHighlightedTabId() {},
    bindFloatingPanels: async (...args) => { calls.push(['bind', ...args]); if (failBind) throw Error('failed'); },
    window: { location, open: (...args) => calls.push(['window.open', ...args]) },
    console: { warn() {} }, useCallback: fn => fn,
    previousSpaceIdRef: { current: null }, currentWindowIdRef: { current: 2 },
    workspaceTabsRef: { current: [] }, getStoredWorkspaceTabs: () => [], getStoredLastSpaceId: () => null,
    resolveSpaceIdForTabItem: () => undefined, rememberActiveTabForSpace() {},
    extractTabNotificationBadge: () => undefined, memoryTmpTabs: [],
  };
  const method = associate.getText(trackerFile).replace(/^public\s+async\s+openAndAssociateTab/, 'async function openAndAssociateTab');
  const js = compile(`${mobileHelper.getText(appFile)}\nconst open = ${openTab.initializer.getText(appFile)};\nconst variant = ${openVariant.initializer.getText(appFile)};\nconst associate = ${method};`);
  const handlers = vm.runInNewContext(`${js}\n({ open, variant, associate })`, context);
  tracker.openAndAssociateTab = handlers.associate.bind(tracker);
  return { ...handlers, calls, associations, location };
}
const url = 'https://example.com/';
const variantUrl = 'https://example.com/variant';
const tab = { id: 'item' };
const variant = { id: 'variant' };
const names = calls => calls.map(c => c[0]);

// Narrow/touch-enabled desktop panels and actual mobile sidebars are never pages to navigate.
for (const environment of [{}, { mobile: true }, { mobile: true, currentError: true }, { android: true }]) {
  const t = setup(environment);
  t.associations.item = { browserTabId: 42, windowId: 3, originalUrl: url };
  await t.open(url, 'item');
  assert.ok(t.calls.some(c => c[0] === 'activate' && c[1] === 42 && c[2] === 3));
  assert.equal(t.location.href, 'extension://sidepanel/index.html');
  assert.ok(!names(t.calls).includes('update'));

  delete t.associations.item;
  t.calls.length = 0;
  await t.open(url, 'item');
  assert.equal(t.associations.item.browserTabId, 73);
  assert.equal(t.associations.item.originalUrl, url);
  assert.ok(t.calls.some(c => c[0] === 'create' && c[1] === url && c[2] === true));
  assert.equal(t.location.href, 'extension://sidepanel/index.html');

  t.calls.length = 0;
  await t.variant(variantUrl, tab, variant);
  assert.ok(t.calls.some(c => c[0] === 'variant' && c[1] === 'item' && c[2] === variantUrl && c[3] === 'variant'));
  assert.equal(t.location.href, 'extension://sidepanel/index.html');
}

// Temporary and favorite-group items keep their own activation and association behavior.
{
  const t = setup({ tmpTabs: [{ id: 'tmp_1', browserTabId: 9, windowId: 3 }] });
  await t.open(url, 'tmp_1', { id: 'tmp_1', browserTabId: 9 });
  assert.ok(t.calls.some(c => c[0] === 'activate' && c[1] === 9 && c[2] === 3));
  const missing = setup();
  await missing.open(url, 'tmp_1', { id: 'tmp_1', browserTabId: 9 });
  assert.ok(names(missing.calls).includes('create'));
  t.calls.length = 0;
  const group = { id: 'group', favourite: true, isGroup: true };
  t.associations.variant = { browserTabId: 44, windowId: 4 };
  await t.variant(variantUrl, group, variant);
  assert.ok(t.calls.some(c => c[0] === 'activate' && c[1] === 44));
  delete t.associations.variant;
  await t.variant(variantUrl, group, variant);
  assert.equal(t.associations.variant.browserTabId, 73);
}

// New-tab modifier bypasses association and works on both desktop and mobile.
for (const environment of [{}, { mobile: true, currentTab: { id: 50 } }]) {
  const t = setup(environment);
  t.associations.item = { browserTabId: 42, windowId: 3 };
  await t.open(url, 'item', undefined, { inNewTab: true });
  await t.variant(variantUrl, tab, variant, { inNewTab: true });
  assert.equal(t.calls.filter(c => c[0] === 'create').length, 2);
  assert.ok(!names(t.calls).includes('activate'));
  assert.ok(!names(t.calls).includes('getCurrent'));
}

// A confirmed mobile full-page workspace navigates itself, including the update-failure fallback.
for (const environment of [{ mobile: true, currentTab: { id: 50 } }, { android: true, currentTab: { id: 50 } }]) {
  const t = setup(environment);
  await t.open(url, 'item');
  await t.variant(variantUrl, tab, variant);
  assert.deepEqual(t.calls.filter(c => c[0] === 'update').map(c => [c[1], c[2]]), [[50, url], [50, variantUrl]]);
  assert.ok(!names(t.calls).includes('create'));
  const failed = setup({ ...environment, failUpdate: true });
  await failed.open(url, 'item');
  assert.equal(failed.location.href, url);
}

// API failures in side panels fall back to a new tab, never the panel's location.
{
  const t = setup({ failBind: true, failVariant: true });
  t.associations.item = { browserTabId: 42, windowId: 3 };
  await t.open(url, 'item');
  await t.variant(variantUrl, tab, variant);
  assert.equal(t.calls.filter(c => c[0] === 'window.open').length, 2);
  assert.equal(t.location.href, 'extension://sidepanel/index.html');
}
console.log('Sidepanel click navigation regression tests passed.');
