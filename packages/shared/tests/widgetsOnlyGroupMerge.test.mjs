import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

// Execute the production hook callback with state/persistence boundaries stubbed.
const source = ts.createSourceFile('useWorkspace.ts', readFileSync(new URL('../src/hooks/useWorkspace.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['mergeTabsIntoGroup', 'extractVariantFromGroup', 'reorderGroupVariants'].includes(node.name.getText(source))) {
    callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callbacks.mergeTabsIntoGroup);
const widget = (id, parentGroupId) => ({ id, style: 'digital', size: 'small', parentGroupId });
const group = (id) => ({ id, favourite: true, isGroup: true, url: 'https://arcable.dev', urlVariants: [], groupItemOrder: [{ type: 'widget', id: `${id}-w` }] });
function merge(tabs, widgets, sourceId, targetId, action = 'mergeTabsIntoGroup', extraArgs = []) {
  const compiled = ts.transpile(`const merge = ${callbacks[action]};`, { target: ts.ScriptTarget.ES2022 });
  let state = { tabs, widgets, spaces: [], folders: [] };
  const operations = [];
  vm.runInNewContext(`${compiled}\nmerge(sourceId, targetId, ...extraArgs);`, {
    sourceId, targetId, extraArgs,
    saveWorkspaceData: (update) => { state = update(state); },
    savePendingOperation: (op) => operations.push(op),
    createWorkspaceOperation: (type, id, payload) => ({ type, id, payload }),
    generateId: () => 'new-group',
    getDomain: (url) => new URL(url).hostname,
    numericRaindropId: (id) => /^\d+$/.test(id) ? Number(id) : undefined,
  });
  return JSON.parse(JSON.stringify({ state, operations }));
}

test('widget onto widget creates an explicit empty tab list, including the sync operation', () => {
  const { state, operations } = merge([], [widget('a'), widget('b')], 'a', 'b');
  assert.deepEqual(state.tabs[0].urlVariants, []);
  assert.deepEqual(operations[0].payload.urlVariants, []);
  assert.ok(state.widgets.every(w => w.parentGroupId === state.tabs[0].id));
});

test('adding a widget to a widgets-only group never promotes the carrier URL', () => {
  const { state } = merge([group('g')], [widget('g-w', 'g'), widget('b')], 'b', 'g');
  assert.deepEqual(state.tabs[0].urlVariants, []);
  assert.equal(state.tabs[0].groupItemOrder.length, 2);
});

test('widgets-only group onto widget preserves all widgets and no tabs', () => {
  const { state } = merge([group('g')], [widget('g-w', 'g'), widget('b')], 'g', 'b');
  assert.deepEqual(state.tabs[0].urlVariants, []);
  assert.deepEqual(state.tabs[0].groupItemOrder.map(e => e.id), ['b', 'g-w']);
});

test('merging widgets-only groups preserves all widgets and no tabs', () => {
  const { state } = merge([group('a'), group('b')], [widget('a-w', 'a'), widget('b-w', 'b')], 'a', 'b');
  assert.equal(state.tabs.length, 1);
  assert.deepEqual(state.tabs[0].urlVariants, []);
  assert.equal(state.tabs[0].groupItemOrder.length, 2);
  assert.ok(state.widgets.every(w => w.parentGroupId === 'b'));
});

for (const reverse of [false, true]) {
  test(`adding a real tab to a widgets-only group (reverse=${reverse}) keeps only the real tab`, () => {
    const tab = { id: 'real', url: 'https://example.com', favourite: true };
    const { state } = merge([tab, group('g')], [widget('g-w', 'g')], reverse ? 'g' : 'real', reverse ? 'real' : 'g');
    assert.deepEqual(state.tabs[0].urlVariants.map(v => v.url), ['https://example.com']);
    assert.equal(state.tabs[0].groupItemOrder.length, 2);
  });
}


test('extracting the last real tab leaves an explicit widgets-only group', () => {
  const mixed = { ...group('g'), urlVariants: [{ id: 'v', url: 'https://example.com', name: 'Real' }], groupItemOrder: [{ type: 'tab', id: 'v' }, { type: 'widget', id: 'g-w' }] };
  const { state, operations } = merge([mixed], [widget('g-w', 'g')], 'g', 'v', 'extractVariantFromGroup');
  const remaining = state.tabs.find(t => t.id === 'g');
  assert.deepEqual(remaining.urlVariants, []);
  assert.deepEqual(remaining.groupItemOrder, [{ type: 'widget', id: 'g-w' }]);
  assert.deepEqual(operations.find(op => op.type === 'TAB_UPDATE').payload.urlVariants, []);
});

test('reordering widgets does not introduce a tab', () => {
  const g = { ...group('g'), groupItemOrder: [{ type: 'widget', id: 'a' }, { type: 'widget', id: 'b' }] };
  const { state } = merge([g], [widget('a', 'g'), widget('b', 'g')], 'g', 'b', 'reorderGroupVariants', ['a', 'before']);
  assert.deepEqual(state.tabs[0].urlVariants, []);
  assert.deepEqual(state.tabs[0].groupItemOrder.map(e => e.id), ['b', 'a']);
});
