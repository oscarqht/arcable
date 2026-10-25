import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Run the production hook with a queued React state boundary. Deliberately keep
// callbacks from the previous render while several UI actions are dispatched.
const require = createRequire(import.meta.url);
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (module, filename) => module._compile(ts.transpileModule(
    readFileSync(filename, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText, filename);
}
let slots, cursor, queued;
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => queued.push(() => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; })];
  },
  useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
  useCallback: fn => fn,
  useMemo: fn => fn(),
  useEffect() {},
};
const originalLoad = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === 'react' && parent?.filename.endsWith('/hooks/useWorkspace.ts')) return react;
  return originalLoad.call(this, name, parent, ...rest);
};
const { useWorkspace } = require('../src/hooks/useWorkspace.ts');
const { mergeIncrementalSyncSnapshot, replayOperations, getStoredPendingOperations } = require('../src/utils/syncEngine.ts');
const { buildBatchUrlReplacementPreview } = require('../src/utils/batchUrlReplacement.ts');
Module._load = originalLoad;

function setup() {
  slots = []; cursor = 0; queued = [];
  const storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  const base = {
    version: 1, activeSpaceId: 's', raindropRootCollectionId: 1,
    raindropArchiveCollectionId: 8, raindropSpaceThemeCollectionId: 9,
    spaces: [{ id: 's', name: 'Space', raindropId: 2 }],
    folders: [{ id: 'f', name: 'Folder', parentSpaceId: 's', raindropId: 3 }],
    tabs: ['a', 'b', 'c'].map((id, i) => ({ id, url: `https://${id}.test`, customTitle: id, parentSpaceId: 's', order: (i + 1) * 1000, raindropId: 10 + i })),
  };
  window.localStorage.setItem('arcable_workspace_data', JSON.stringify(base));
  const hook = useWorkspace();
  return { hook, base, flush() { while (queued.length) queued.shift()(); cursor = 0; return useWorkspace().data; } };
}

test('rename then reorder before a render preserves the rename in state and outbox', () => {
  const { hook, flush } = setup();
  hook.updateTab('a', { customTitle: 'Renamed' });
  hook.reorderSiblingItem({ sourceId: 'a', sourceType: 'tab', targetId: 'b', targetType: 'tab', position: 'after' });
  const state = flush();
  assert.equal(state.tabs.find(t => t.id === 'a').customTitle, 'Renamed');
  assert.equal(replayOperations(state, getStoredPendingOperations()).tabs.find(t => t.id === 'a').customTitle, 'Renamed');
});

test('folder rename and bookmark move survive a rapid keyboard reorder', () => {
  const { hook, flush } = setup();
  hook.updateFolder('f', { name: 'Renamed folder' });
  hook.updateTab('c', { parentFolderId: 'f' });
  hook.moveSiblingItem('a', 'tab', 'down');
  const state = flush();
  assert.equal(state.folders[0].name, 'Renamed folder');
  assert.equal(state.tabs.find(t => t.id === 'c').parentFolderId, 'f');
});

test('batch URL replacement persists only selected current rows without normalization or lost edits', () => {
  const { hook, base, flush } = setup();
  const tmpTabs = [{ id: 'tmp', url: 'https://temporary.test', title: 'Temporary' }];
  hook.saveWorkspaceData(prev => ({ ...prev, tmpTabs }));
  const preview = buildBatchUrlReplacementPreview(hook.getLatestData().tabs, 'https://', '');
  // Dispatch using the same render, with a metadata edit and a stale URL row.
  hook.updateTab('a', { note: 'Edited during preview' });
  hook.updateTab('c', { url: 'https://changed.test' });
  hook.replaceTabUrls(preview.filter(row => row.tabId !== 'b'));
  const state = flush();
  assert.equal(state.tabs[0].url, 'a.test');
  assert.equal(state.tabs[0].note, 'Edited during preview');
  assert.equal(state.tabs[1].url, base.tabs[1].url);
  assert.equal(state.tabs[2].url, 'https://changed.test');
  assert.deepEqual(state.tmpTabs, tmpTabs);
  assert.equal(JSON.parse(window.localStorage.getItem('arcable_workspace_data')).tabs[0].url, 'a.test');
  const operations = getStoredPendingOperations();
  assert.deepEqual(operations.at(-1).payload, { url: 'a.test' });
  const replayed = replayOperations(base, operations);
  assert.equal(replayed.tabs[0].url, 'a.test');
  assert.equal(replayed.tabs[0].note, 'Edited during preview');
});

test('batch URL replacement saves an empty default URL and unchanged variant metadata in its outbox', () => {
  const { hook, flush } = setup();
  const variants = [
    { id: 'main', name: 'Main', url: 'https://clear.test', customEmojiIcon: '🦚' },
    { id: 'other', name: 'Other', url: 'https://keep.test', favIconUrl: 'https://keep.test/icon.png' },
  ];
  hook.saveWorkspaceData(prev => ({ ...prev, tabs: [{
    ...prev.tabs[0], url: variants[0].url, defaultVariantId: 'main', urlVariants: variants,
    favIconUrl: 'https://clear.test/icon.png',
  }] }));
  const preview = buildBatchUrlReplacementPreview(hook.getLatestData().tabs, 'https://clear.test', '');
  hook.replaceTabUrls(preview);
  const saved = flush().tabs[0];
  assert.equal(saved.url, '');
  assert.equal(saved.urlVariants[0].url, '');
  assert.equal(saved.defaultVariantId, 'main');
  assert.equal(saved.customTitle, 'a');
  assert.equal(saved.favIconUrl, 'https://clear.test/icon.png');
  assert.deepEqual(saved.urlVariants, [{ ...variants[0], url: '' }, variants[1]]);
  assert.deepEqual(getStoredPendingOperations().at(-1).payload, { url: '', urlVariants: saved.urlVariants });
  const stored = JSON.parse(window.localStorage.getItem('arcable_workspace_data'));
  assert.equal(stored.tabs[0].url, '');
  assert.equal(stored.tabs[0].urlVariants[0].url, '');
});

test('an older save response cannot restore an explicitly cleared title or note', () => {
  const { base } = setup();
  const synced = { ...base, tabs: [{ ...base.tabs[0], note: 'old note' }] };
  const current = { ...base, tabs: [{ ...base.tabs[0], customTitle: undefined, note: '' }] };
  const merged = mergeIncrementalSyncSnapshot(current, synced);
  assert.equal(merged.tabs[0].customTitle, undefined);
  assert.equal(merged.tabs[0].note, '');
});

test('replaying an in-flight edit preserves remote collection identities', () => {
  const { base } = setup();
  const replayed = replayOperations(base, [{ id: 'op', entityId: 'a', type: 'TAB_UPDATE', payload: { order: 500 }, timestamp: 1 }]);
  assert.equal(replayed.raindropArchiveCollectionId, 8);
  assert.equal(replayed.raindropSpaceThemeCollectionId, 9);
});

test('a delayed save retains subsequent rename, move, deletion and queued operations', async () => {
  const { hook, flush } = setup();
  const sync = require('../src/utils/raindropSync.ts');
  const originalSync = sync.syncWorkspaceWithRaindrop;
  let finish;
  let sent;
  sync.syncWorkspaceWithRaindrop = async (_token, options) => {
    sent = structuredClone(options);
    return new Promise(resolve => { finish = resolve; });
  };
  try {
    hook.updateTab('a', { customTitle: 'First rename' });
    const pending = hook.syncWithRaindropToken('test');
    assert.equal(sent.localState.tabs[0].customTitle, 'First rename');
    hook.updateTab('a', { customTitle: 'Final rename' });
    hook.updateTab('b', { parentFolderId: 'f' });
    hook.deleteTab('c');
    const laterIds = getStoredPendingOperations().filter(op => !sent.pendingOps.some(sentOp => sentOp.id === op.id)).map(op => op.id);
    finish({ success: true, latestSnapshot: sent.localState });
    await pending;
    const state = flush();
    assert.equal(state.tabs.find(t => t.id === 'a').customTitle, 'Final rename');
    assert.equal(state.tabs.find(t => t.id === 'b').parentFolderId, 'f');
    assert.ok(!state.tabs.some(t => t.id === 'c'));
    assert.deepEqual(getStoredPendingOperations().map(op => op.id), laterIds);
    // The next save must send the final optimistic state, even using the old handler.
    const trailing = hook.syncWithRaindropToken('test');
    assert.equal(sent.localState.tabs.find(t => t.id === 'a').customTitle, 'Final rename');
    assert.equal(sent.pendingOps.length, laterIds.length);
    finish({ success: true, latestSnapshot: sent.localState });
    await trailing;
    assert.equal(getStoredPendingOperations().length, 0);
  } finally { sync.syncWorkspaceWithRaindrop = originalSync; }
});

test('WorkspaceManager drains edits made during an active save in a second cycle', async () => {
  const { hook, flush } = setup();
  const vm = await import('node:vm');
  const engine = require('../src/utils/syncEngine.ts');
  const sync = require('../src/utils/raindropSync.ts');
  const text = readFileSync(new URL('../src/components/workspace/WorkspaceManager.tsx', import.meta.url), 'utf8');
  const source = ts.createSourceFile('WorkspaceManager.tsx', text, ts.ScriptTarget.Latest, true);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'executeSyncCycle') callback = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const requests = [];
  const automatic = { current: false };
  const context = vm.createContext({
    ...engine,
    INCREMENTAL_OPERATION_TYPES: sync.INCREMENTAL_OPERATION_TYPES,
    getLatestData: hook.getLatestData,
    applyLatestSnapshot: hook.applyLatestSnapshot,
    onSyncRaindrop: options => new Promise(resolve => requests.push({ options: structuredClone(options), resolve })),
    isCurrentSyncSilentRef: { current: true }, syncSeqRef: { current: 0 },
    activeSyncPromiseRef: { current: null }, queuedManualSyncRef: { current: false },
    queuedAutomaticSyncRef: automatic, lastSyncCompletedAtRef: { current: 0 },
    setSyncLoading() {}, setSyncFeedback() {}, setTimeout() {},
    VIRTUAL_SYNCED_TABS_SPACE_ID: 'virtual',
  });
  vm.runInContext(ts.transpile(`const executeSyncCycle = ${callback}; globalThis.run = executeSyncCycle;`, { target: ts.ScriptTarget.ES2022 }), context);
  hook.updateTab('a', { customTitle: 'First' });
  const first = context.run(true);
  hook.updateTab('a', { customTitle: 'Final' });
  hook.updateTab('b', { parentFolderId: 'f' });
  hook.updateFolder('f', { name: 'Final folder' });
  automatic.current = true;
  requests[0].resolve({ success: true, latestSnapshot: requests[0].options.localState });
  // Let the coordinator's awaited response and finally block start the trailing cycle.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.localState.tabs.find(t => t.id === 'a').customTitle, 'Final');
  assert.equal(requests[1].options.localState.tabs.find(t => t.id === 'b').parentFolderId, 'f');
  assert.equal(requests[1].options.localState.folders[0].name, 'Final folder');
  assert.equal(requests[1].options.pendingOps.length, 3);
  requests[1].resolve({ success: true, latestSnapshot: requests[1].options.localState });
  await first;
  assert.equal(getStoredPendingOperations().length, 0);
  assert.equal(flush().tabs.find(t => t.id === 'a').customTitle, 'Final');
});

test('extension options snapshot broadcasts do not discard another surface\'s pending edits', async () => {
  const { hook, base } = setup();
  const vm = await import('node:vm');
  hook.updateTab('a', { customTitle: 'Unsaved rename' });
  hook.updateTab('b', { parentFolderId: 'f' });
  const ids = getStoredPendingOperations().map(op => op.id);
  const text = readFileSync(new URL('../../../apps/extension/src/options/App.tsx', import.meta.url), 'utf8');
  const source = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true);
  let block;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(source).includes('changes.arcable_workspace_snapshot?.newValue')) block = node.thenStatement.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(block);
  vm.runInNewContext(ts.transpile(block, { target: ts.ScriptTarget.ES2022 }), {
    ...require('../src/utils/syncEngine.ts'),
    window, CustomEvent, changes: { arcable_workspace_snapshot: { newValue: base } },
  });
  const saved = JSON.parse(window.localStorage.getItem('arcable_workspace_data'));
  assert.equal(saved.tabs.find(t => t.id === 'a').customTitle, 'Unsaved rename');
  assert.equal(saved.tabs.find(t => t.id === 'b').parentFolderId, 'f');
  assert.deepEqual(getStoredPendingOperations().map(op => op.id), ids);
});
