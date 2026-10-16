import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual sidepanel callback together with WorkspaceManager's
// imperative reveal method: tracker-only tests cannot observe UI navigation.
async function findNode(path, predicate) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let match;
  function visit(node) {
    if (predicate(node)) match = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(match, `Expected production handler in ${path}`);
  return { node: match, file };
}

function evaluate(expression, context) {
  const js = ts.transpileModule(`const handler = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(`${js}\nhandler;`, context);
}

const activation = await findNode('../src/sidepanel/App.tsx', (node) =>
  ts.isCallExpression(node) && node.expression.getText() === 'tabTracker.onTabItemActivated');
const reveal = await findNode('../../../packages/shared/src/components/workspace/WorkspaceManager.tsx', (node) =>
  ts.isPropertyAssignment(node) && node.name.getText() === 'revealAndHighlightTab');
const resolve = await findNode('../src/sidepanel/spaceTabTracker.ts', (node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'resolveSpaceIdForTabItem');
const resolveSpaceIdForTabItem = evaluate(resolve.node.getText(resolve.file).replace(/^export\s+/, ''), {});

const tabs = [
  { id: 'tab-A', parentSpaceId: 'space-A' },
  { id: 'tab-B', parentSpaceId: 'space-B' },
  { id: 'favorite-B', parentSpaceId: 'space-B', favourite: true,
    urlVariants: [{ id: 'favorite-variant' }] },
];
let activeSpaceId;
let highlighted;
const switches = [];
const context = {
  data: { tabs },
  setActiveSpace(id) { switches.push(id); activeSpaceId = id; },
};
const revealAndHighlightTab = evaluate(reveal.node.initializer.getText(reveal.file), context);
const onActivated = evaluate(activation.node.arguments[0].getText(activation.file), {
  clearMousePos() {},
  workspaceTabsRef: { current: tabs },
  getStoredWorkspaceTabs: () => tabs,
  tmpTabsRef: { current: [{ id: 'tmp_A', spaceId: 'space-A' }] },
  workspaceRef: { current: { getActiveSpace: () => ({ id: activeSpaceId }), revealAndHighlightTab } },
  setHighlightedTabId(id) { highlighted = id; },
  resolveSpaceIdForTabItem,
  currentWindowIdRef: { current: 1 },
  rememberActiveTabForSpace() {},
});

for (const causedByClose of [false, true, undefined]) {
  for (const [id, expectedHighlight] of [
    ['favorite-B', 'favorite-B'],
    ['favorite-variant', 'favorite-variant'],
    ['tab-A', 'tab-A'],
    ['tab-B', null],
    ['tmp_A', 'tmp_A'],
    [null, null],
  ]) {
    activeSpaceId = 'space-A';
    switches.length = 0;
    onActivated(id, causedByClose === undefined ? undefined : { browserTabId: 42, windowId: 1, causedByClose });
    assert.equal(activeSpaceId, 'space-A', `activation of ${id} must preserve the viewed space`);
    assert.equal(switches.length, 0, 'passive activation must never request space navigation');
    assert.equal(highlighted, expectedHighlight);
  }
}

// Explicit reveal/navigation elsewhere retains its existing behavior.
revealAndHighlightTab('tab-B');
assert.equal(activeSpaceId, 'space-B');
console.log('Sidepanel tab activation tests passed.');
